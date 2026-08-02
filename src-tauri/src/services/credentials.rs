#![cfg_attr(test, allow(dead_code))]

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::sync::{Mutex, MutexGuard, OnceLock};

const SERVICE: &str = "com.cuoti.zhiku";
const LEGACY_DASHSCOPE_ACCOUNT: &str = "dashscope-api-key";
const BAILIAN_PROVIDER_ID: &str = "bailian";
const TESTED_CONFIG_ACCOUNT: &str = "ai-tested-config-fingerprint";
const ACTIVE_CONFIG_ACCOUNT: &str = "ai-active-config-fingerprint";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum CredentialError {
    Missing,
    Unavailable,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CredentialMigrationStatus {
    Ready,
    NotNeeded,
    Migrated,
    Conflict,
    Failed,
}

pub(crate) trait CredentialBackend {
    fn get(&self, account: &str) -> Result<String, CredentialError>;
    fn set(&self, account: &str, value: &str) -> Result<(), CredentialError>;
    fn delete(&self, account: &str) -> Result<(), CredentialError>;
}

#[derive(Default)]
pub(crate) struct CredentialMutationCoordinator {
    mutation_lock: Mutex<()>,
}

impl CredentialMutationCoordinator {
    fn lock(&self) -> MutexGuard<'_, ()> {
        self.mutation_lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[cfg(test)]
    pub(crate) fn is_locked_for_test(&self) -> bool {
        self.mutation_lock.try_lock().is_err()
    }
}

fn system_mutation_coordinator() -> &'static CredentialMutationCoordinator {
    static COORDINATOR: OnceLock<CredentialMutationCoordinator> = OnceLock::new();
    COORDINATOR.get_or_init(CredentialMutationCoordinator::default)
}

fn migration_status_slot() -> &'static Mutex<CredentialMigrationStatus> {
    static STATUS: OnceLock<Mutex<CredentialMigrationStatus>> = OnceLock::new();
    STATUS.get_or_init(|| Mutex::new(CredentialMigrationStatus::Ready))
}

fn set_migration_status(status: CredentialMigrationStatus) {
    *migration_status_slot()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = status;
}

struct WindowsCredentialBackend;

impl WindowsCredentialBackend {
    fn entry(account: &str) -> Result<keyring::Entry, CredentialError> {
        keyring::Entry::new(SERVICE, account).map_err(map_keyring_error)
    }
}

impl CredentialBackend for WindowsCredentialBackend {
    fn get(&self, account: &str) -> Result<String, CredentialError> {
        Self::entry(account)?
            .get_password()
            .map_err(map_keyring_error)
    }

    fn set(&self, account: &str, value: &str) -> Result<(), CredentialError> {
        Self::entry(account)?
            .set_password(value)
            .map_err(map_keyring_error)
    }

    fn delete(&self, account: &str) -> Result<(), CredentialError> {
        Self::entry(account)?
            .delete_credential()
            .map_err(map_keyring_error)
    }
}

fn map_keyring_error(error: keyring::Error) -> CredentialError {
    match error {
        keyring::Error::NoEntry => CredentialError::Missing,
        _ => CredentialError::Unavailable,
    }
}

fn provider_account(provider_id: &str) -> Result<String, String> {
    if provider_id.is_empty()
        || !provider_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err("AI 平台标识无效。".to_owned());
    }
    Ok(format!("ai-provider:{provider_id}"))
}

pub(crate) fn bound_provider_account(provider_id: &str, normalized_endpoint: &str) -> Result<String, String> {
    let provider = provider_account(provider_id)?;
    if normalized_endpoint.trim().is_empty() {
        return Err("AI 接口地址无效。".to_owned());
    }
    let digest = Sha256::digest(normalized_endpoint.as_bytes());
    Ok(format!("{provider}:endpoint:{digest:x}"))
}

fn canonical_builtin_endpoint(provider_id: &str) -> Option<&'static str> {
    match provider_id {
        "bailian" => Some("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"),
        "deepseek" => Some("https://api.deepseek.com/chat/completions"),
        "zhipu" => Some("https://open.bigmodel.cn/api/paas/v4/chat/completions"),
        "moonshot" => Some("https://api.moonshot.cn/v1/chat/completions"),
        "openai" => Some("https://api.openai.com/v1/chat/completions"),
        _ => None,
    }
}

fn authorization_marker(bound_account: &str, fingerprint: &str) -> String {
    format!("{bound_account}\n{fingerprint}")
}

fn marker_matches(value: &str, bound_account: &str, fingerprint: &str) -> bool {
    value == authorization_marker(bound_account, fingerprint)
}

fn invalidate_marker_for_bound_account<B: CredentialBackend>(
    backend: &B,
    marker_account: &str,
    bound_account: &str,
) -> Result<(), String> {
    let value = match backend.get(marker_account) {
        Ok(value) => value,
        Err(CredentialError::Missing) => return Ok(()),
        Err(CredentialError::Unavailable) => return Err(unavailable_error()),
    };
    if value.split_once('\n').is_some_and(|(account, _)| account == bound_account) {
        // Revoke first. If deletion is unavailable, the marker remains unusable and
        // a replacement key is never installed under an old authorization.
        backend
            .set(marker_account, "revoked")
            .map_err(|_| unavailable_error())?;
        match backend.delete(marker_account) {
            Ok(()) | Err(CredentialError::Missing) => {}
            Err(CredentialError::Unavailable) => return Err(unavailable_error()),
        }
    }
    Ok(())
}

fn invalidate_authorization_for_bound_account<B: CredentialBackend>(
    backend: &B,
    bound_account: &str,
) -> Result<(), String> {
    // Active authorization is revoked first so every later failure is fail-closed.
    invalidate_marker_for_bound_account(backend, ACTIVE_CONFIG_ACCOUNT, bound_account)?;
    invalidate_marker_for_bound_account(backend, TESTED_CONFIG_ACCOUNT, bound_account)
}

fn migrate_unbound_builtin_key_unlocked<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
    normalized_endpoint: &str,
) -> Result<(), String> {
    if canonical_builtin_endpoint(provider_id) != Some(normalized_endpoint) {
        return Ok(());
    }
    let old_account = provider_account(provider_id)?;
    let new_account = bound_provider_account(provider_id, normalized_endpoint)?;
    let value = match backend.get(&old_account) {
        Ok(value) => value,
        Err(CredentialError::Missing) => return Ok(()),
        Err(CredentialError::Unavailable) => return Err(unavailable_error()),
    };
    match backend.get(&new_account) {
        Ok(existing) if existing == value => {}
        Ok(_) => return Ok(()),
        Err(CredentialError::Missing) => backend
            .set(&new_account, &value)
            .map_err(|_| unavailable_error())?,
        Err(CredentialError::Unavailable) => return Err(unavailable_error()),
    }
    let readback = backend.get(&new_account).map_err(|_| unavailable_error())?;
    if readback != value {
        return Err(migration_verify_error());
    }
    backend.delete(&old_account).map_err(|_| unavailable_error())
}

pub(crate) fn save_bound_provider_key_with_coordinator<B: CredentialBackend>(
    coordinator: &CredentialMutationCoordinator,
    backend: &B,
    provider_id: &str,
    normalized_endpoint: &str,
    value: &str,
) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("API Key 不能为空。".to_owned());
    }
    let _mutation = coordinator.lock();
    let account = bound_provider_account(provider_id, normalized_endpoint)?;
    invalidate_authorization_for_bound_account(backend, &account)?;
    backend.set(&account, value).map_err(|_| unavailable_error())
}

pub(crate) fn save_bound_provider_key_with_backend<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
    normalized_endpoint: &str,
    value: &str,
) -> Result<(), String> {
    save_bound_provider_key_with_coordinator(
        system_mutation_coordinator(),
        backend,
        provider_id,
        normalized_endpoint,
        value,
    )
}

pub(crate) fn read_bound_provider_key_with_backend<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
    normalized_endpoint: &str,
) -> Result<String, String> {
    let _mutation = system_mutation_coordinator().lock();
    let account = bound_provider_account(provider_id, normalized_endpoint)?;
    if matches!(backend.get(&account), Err(CredentialError::Missing)) {
        migrate_unbound_builtin_key_unlocked(backend, provider_id, normalized_endpoint)?;
    }
    backend.get(&account).map_err(|error| match error {
        CredentialError::Missing => missing_key_error(),
        CredentialError::Unavailable => unavailable_error(),
    })
}

pub(crate) fn has_bound_provider_key_with_backend<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
    normalized_endpoint: &str,
) -> Result<bool, String> {
    match read_bound_provider_key_with_backend(backend, provider_id, normalized_endpoint) {
        Ok(_) => Ok(true),
        Err(error) if error == missing_key_error() => Ok(false),
        Err(error) => Err(error),
    }
}

pub(crate) fn clear_bound_provider_key_with_backend<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
    normalized_endpoint: &str,
) -> Result<(), String> {
    let _mutation = system_mutation_coordinator().lock();
    let account = bound_provider_account(provider_id, normalized_endpoint)?;
    match backend.delete(&account) {
        Ok(()) | Err(CredentialError::Missing) => {}
        Err(CredentialError::Unavailable) => return Err(unavailable_error()),
    }
    invalidate_authorization_for_bound_account(backend, &account)?;
    if canonical_builtin_endpoint(provider_id) == Some(normalized_endpoint) {
        let unbound = provider_account(provider_id)?;
        match backend.delete(&unbound) {
            Ok(()) | Err(CredentialError::Missing) => {}
            Err(CredentialError::Unavailable) => return Err(unavailable_error()),
        }
        if provider_id == BAILIAN_PROVIDER_ID {
            match backend.delete(LEGACY_DASHSCOPE_ACCOUNT) {
                Ok(()) | Err(CredentialError::Missing) => {}
                Err(CredentialError::Unavailable) => return Err(unavailable_error()),
            }
        }
    }
    Ok(())
}

pub(crate) fn record_tested_provider_config_with_backend<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
    normalized_endpoint: &str,
    fingerprint: &str,
) -> Result<(), String> {
    let _mutation = system_mutation_coordinator().lock();
    let account = bound_provider_account(provider_id, normalized_endpoint)?;
    match backend.get(&account) {
        Ok(_) => {}
        Err(CredentialError::Missing) => return Err(missing_key_error()),
        Err(CredentialError::Unavailable) => return Err(unavailable_error()),
    }
    backend
        .set(TESTED_CONFIG_ACCOUNT, &authorization_marker(&account, fingerprint))
        .map_err(|_| unavailable_error())
}

pub(crate) fn activate_provider_config_with_backend<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
    normalized_endpoint: &str,
    fingerprint: &str,
) -> Result<(), String> {
    let _mutation = system_mutation_coordinator().lock();
    let account = bound_provider_account(provider_id, normalized_endpoint)?;
    match backend.get(&account) {
        Ok(_) => {}
        Err(CredentialError::Missing) => return Err(missing_key_error()),
        Err(CredentialError::Unavailable) => return Err(unavailable_error()),
    }
    let tested = backend.get(TESTED_CONFIG_ACCOUNT).map_err(|error| match error {
        CredentialError::Missing => "请先测试当前 AI 配置，再将它设为当前平台。".to_owned(),
        CredentialError::Unavailable => unavailable_error(),
    })?;
    if !marker_matches(&tested, &account, fingerprint) {
        return Err("当前 AI 配置与最近通过测试的配置不一致，请重新测试。".to_owned());
    }
    backend
        .set(ACTIVE_CONFIG_ACCOUNT, &authorization_marker(&account, fingerprint))
        .map_err(|_| unavailable_error())
}

pub(crate) fn assert_active_provider_config_with_backend<B: CredentialBackend>(
    backend: &B,
    fingerprint: &str,
) -> Result<(), String> {
    let _mutation = system_mutation_coordinator().lock();
    let active = backend.get(ACTIVE_CONFIG_ACCOUNT).map_err(|error| match error {
        CredentialError::Missing => "当前 AI 配置尚未在本机激活，请前往设置测试并设为当前。".to_owned(),
        CredentialError::Unavailable => unavailable_error(),
    })?;
    if active.split_once('\n').is_some_and(|(_, saved)| saved == fingerprint) {
        Ok(())
    } else {
        Err("本次请求的 AI 配置不是本机当前配置，已在读取 Key 前停止。".to_owned())
    }
}

pub(crate) fn is_active_provider_config_with_backend<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
    normalized_endpoint: &str,
    fingerprint: &str,
) -> Result<bool, String> {
    let _mutation = system_mutation_coordinator().lock();
    let account = bound_provider_account(provider_id, normalized_endpoint)?;
    match backend.get(ACTIVE_CONFIG_ACCOUNT) {
        Ok(active) => Ok(marker_matches(&active, &account, fingerprint)),
        Err(CredentialError::Missing) => Ok(false),
        Err(CredentialError::Unavailable) => Err(unavailable_error()),
    }
}

fn unavailable_error() -> String {
    "无法访问 Windows 凭据管理器，请确认系统凭据服务可用后重试。".to_owned()
}

fn missing_key_error() -> String {
    "尚未在 Windows 凭据管理器中保存该 AI 平台的 API Key。".to_owned()
}

fn migration_verify_error() -> String {
    "AI 平台凭据迁移校验未完成，可在设置中重试。".to_owned()
}

#[cfg(test)]
fn save_provider_key_unlocked<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
    value: &str,
) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("API Key 不能为空。".to_owned());
    }
    let account = provider_account(provider_id)?;
    backend
        .set(&account, value)
        .map_err(|_| unavailable_error())
}

#[cfg(test)]
pub(crate) fn save_provider_key_with_coordinator<B: CredentialBackend>(
    coordinator: &CredentialMutationCoordinator,
    backend: &B,
    provider_id: &str,
    value: &str,
) -> Result<(), String> {
    let _mutation = coordinator.lock();
    save_provider_key_unlocked(backend, provider_id, value)
}

#[cfg(test)]
pub(crate) fn save_provider_key_with_backend<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
    value: &str,
) -> Result<(), String> {
    save_provider_key_with_coordinator(system_mutation_coordinator(), backend, provider_id, value)
}

#[cfg(test)]
pub(crate) fn read_provider_key_with_backend<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
) -> Result<String, String> {
    let account = provider_account(provider_id)?;
    backend.get(&account).map_err(|error| match error {
        CredentialError::Missing => missing_key_error(),
        CredentialError::Unavailable => unavailable_error(),
    })
}

#[cfg(test)]
pub(crate) fn has_provider_key_with_backend<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
) -> Result<bool, String> {
    let account = provider_account(provider_id)?;
    match backend.get(&account) {
        Ok(_) => Ok(true),
        Err(CredentialError::Missing) => Ok(false),
        Err(CredentialError::Unavailable) => Err(unavailable_error()),
    }
}

#[cfg(test)]
fn clear_provider_key_unlocked<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
) -> Result<(), String> {
    let account = provider_account(provider_id)?;
    match backend.delete(&account) {
        Ok(()) | Err(CredentialError::Missing) => Ok(()),
        Err(CredentialError::Unavailable) => Err(unavailable_error()),
    }
}

#[cfg(test)]
fn clear_provider_key_with_coordinator<B: CredentialBackend>(
    coordinator: &CredentialMutationCoordinator,
    backend: &B,
    provider_id: &str,
) -> Result<(), String> {
    let _mutation = coordinator.lock();
    clear_provider_key_unlocked(backend, provider_id)
}

#[cfg(test)]
pub(crate) fn clear_provider_key_with_backend<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
) -> Result<(), String> {
    clear_provider_key_with_coordinator(system_mutation_coordinator(), backend, provider_id)
}

fn migrate_legacy_dashscope_key_unlocked<B: CredentialBackend>(
    backend: &B,
) -> Result<CredentialMigrationStatus, String> {
    let read_optional = |account: &str| match backend.get(account) {
        Ok(value) => Ok(Some(value)),
        Err(CredentialError::Missing) => Ok(None),
        Err(CredentialError::Unavailable) => Err(unavailable_error()),
    };
    let legacy_key = read_optional(LEGACY_DASHSCOPE_ACCOUNT)?;
    let unbound_account = provider_account(BAILIAN_PROVIDER_ID)?;
    let unbound_key = read_optional(&unbound_account)?;
    let bailian_account = bound_provider_account(
        BAILIAN_PROVIDER_ID,
        canonical_builtin_endpoint(BAILIAN_PROVIDER_ID).expect("Bailian endpoint"),
    )?;
    let bound_key = read_optional(&bailian_account)?;

    if let Some(bound_key) = bound_key {
        if unbound_key.as_ref().is_some_and(|value| value != &bound_key)
            || legacy_key.as_ref().is_some_and(|value| value != &bound_key)
        {
            return Ok(CredentialMigrationStatus::Conflict);
        }
        let mut removed_legacy = false;
        for account in [&unbound_account, LEGACY_DASHSCOPE_ACCOUNT] {
            match backend.delete(account) {
                Ok(()) => removed_legacy = true,
                Err(CredentialError::Missing) => {}
                Err(CredentialError::Unavailable) => return Err(unavailable_error()),
            }
        }
        return Ok(if removed_legacy {
            CredentialMigrationStatus::Migrated
        } else {
            CredentialMigrationStatus::NotNeeded
        });
    }

    if unbound_key.is_some()
        && legacy_key.is_some()
        && unbound_key.as_ref() != legacy_key.as_ref()
    {
        return Ok(CredentialMigrationStatus::Conflict);
    }

    let Some(current_key) = unbound_key.as_ref().or(legacy_key.as_ref()) else {
        return Ok(CredentialMigrationStatus::NotNeeded);
    };
    backend
        .set(&bailian_account, current_key)
        .map_err(|_| unavailable_error())?;
    let readback = backend
        .get(&bailian_account)
        .map_err(|_| unavailable_error())?;
    if readback != *current_key {
        return Err(migration_verify_error());
    }

    for account in [&unbound_account, LEGACY_DASHSCOPE_ACCOUNT] {
        match backend.delete(account) {
            Ok(()) | Err(CredentialError::Missing) => {}
            Err(CredentialError::Unavailable) => return Err(unavailable_error()),
        }
    }
    Ok(CredentialMigrationStatus::Migrated)
}

pub(crate) fn migrate_legacy_dashscope_key_with_coordinator<B: CredentialBackend>(
    coordinator: &CredentialMutationCoordinator,
    backend: &B,
) -> Result<CredentialMigrationStatus, String> {
    let _mutation = coordinator.lock();
    migrate_legacy_dashscope_key_unlocked(backend)
}

pub(crate) fn migrate_legacy_dashscope_key<B: CredentialBackend>(
    backend: &B,
) -> Result<CredentialMigrationStatus, String> {
    migrate_legacy_dashscope_key_with_coordinator(system_mutation_coordinator(), backend)
}

pub fn save_provider_key(
    provider_id: &str,
    normalized_endpoint: &str,
    value: &str,
) -> Result<(), String> {
    save_bound_provider_key_with_backend(
        &WindowsCredentialBackend,
        provider_id,
        normalized_endpoint,
        value,
    )
}

pub fn read_provider_key(provider_id: &str, normalized_endpoint: &str) -> Result<String, String> {
    read_bound_provider_key_with_backend(&WindowsCredentialBackend, provider_id, normalized_endpoint)
}

pub fn has_provider_key(provider_id: &str, normalized_endpoint: &str) -> Result<bool, String> {
    has_bound_provider_key_with_backend(&WindowsCredentialBackend, provider_id, normalized_endpoint)
}

pub fn clear_provider_key(provider_id: &str, normalized_endpoint: &str) -> Result<(), String> {
    clear_bound_provider_key_with_backend(&WindowsCredentialBackend, provider_id, normalized_endpoint)
}

pub fn record_tested_provider_config(
    provider_id: &str,
    normalized_endpoint: &str,
    fingerprint: &str,
) -> Result<(), String> {
    record_tested_provider_config_with_backend(
        &WindowsCredentialBackend,
        provider_id,
        normalized_endpoint,
        fingerprint,
    )
}

pub fn activate_provider_config(
    provider_id: &str,
    normalized_endpoint: &str,
    fingerprint: &str,
) -> Result<(), String> {
    activate_provider_config_with_backend(
        &WindowsCredentialBackend,
        provider_id,
        normalized_endpoint,
        fingerprint,
    )
}

pub fn assert_active_provider_config(fingerprint: &str) -> Result<(), String> {
    assert_active_provider_config_with_backend(&WindowsCredentialBackend, fingerprint)
}

pub fn is_active_provider_config(
    provider_id: &str,
    normalized_endpoint: &str,
    fingerprint: &str,
) -> Result<bool, String> {
    is_active_provider_config_with_backend(
        &WindowsCredentialBackend,
        provider_id,
        normalized_endpoint,
        fingerprint,
    )
}

fn attempt_legacy_dashscope_migration() -> CredentialMigrationStatus {
    let status = match migrate_legacy_dashscope_key(&WindowsCredentialBackend) {
        Ok(status) => status,
        Err(_) => {
            eprintln!("AI credential migration did not finish; it can be retried from Settings.");
            CredentialMigrationStatus::Failed
        }
    };
    set_migration_status(status);
    status
}

pub fn migrate_legacy_dashscope_key_on_startup() -> CredentialMigrationStatus {
    attempt_legacy_dashscope_migration()
}

pub fn credential_migration_status() -> CredentialMigrationStatus {
    *migration_status_slot()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn retry_credential_migration() -> CredentialMigrationStatus {
    attempt_legacy_dashscope_migration()
}

// Legacy compatibility is deliberately routed through the provider-scoped Bailian entry.
pub fn save_api_key(value: &str) -> Result<(), String> {
    save_provider_key(
        BAILIAN_PROVIDER_ID,
        canonical_builtin_endpoint(BAILIAN_PROVIDER_ID).expect("Bailian endpoint"),
        value,
    )
}

#[allow(dead_code)]
pub fn read_api_key() -> Result<String, String> {
    read_provider_key(
        BAILIAN_PROVIDER_ID,
        canonical_builtin_endpoint(BAILIAN_PROVIDER_ID).expect("Bailian endpoint"),
    )
}

pub fn has_api_key() -> bool {
    has_provider_key(
        BAILIAN_PROVIDER_ID,
        canonical_builtin_endpoint(BAILIAN_PROVIDER_ID).expect("Bailian endpoint"),
    )
    .unwrap_or(false)
}

pub fn clear_api_key() -> Result<(), String> {
    clear_provider_key(
        BAILIAN_PROVIDER_ID,
        canonical_builtin_endpoint(BAILIAN_PROVIDER_ID).expect("Bailian endpoint"),
    )
}

#[cfg(test)]
#[derive(Default)]
pub(crate) struct MemoryCredentialBackend {
    values: Mutex<std::collections::BTreeMap<String, String>>,
}

#[cfg(test)]
impl CredentialBackend for MemoryCredentialBackend {
    fn get(&self, account: &str) -> Result<String, CredentialError> {
        self.values
            .lock()
            .expect("test backend lock")
            .get(account)
            .cloned()
            .ok_or(CredentialError::Missing)
    }

    fn set(&self, account: &str, value: &str) -> Result<(), CredentialError> {
        self.values
            .lock()
            .expect("test backend lock")
            .insert(account.to_owned(), value.to_owned());
        Ok(())
    }

    fn delete(&self, account: &str) -> Result<(), CredentialError> {
        if self
            .values
            .lock()
            .expect("test backend lock")
            .remove(account)
            .is_some()
        {
            Ok(())
        } else {
            Err(CredentialError::Missing)
        }
    }
}
