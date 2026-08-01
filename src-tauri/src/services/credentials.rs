#![cfg_attr(test, allow(dead_code))]

use serde::Serialize;
use std::sync::{Mutex, MutexGuard, OnceLock};

const SERVICE: &str = "com.cuoti.zhiku";
const LEGACY_DASHSCOPE_ACCOUNT: &str = "dashscope-api-key";
const BAILIAN_PROVIDER_ID: &str = "bailian";

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

fn unavailable_error() -> String {
    "无法访问 Windows 凭据管理器，请确认系统凭据服务可用后重试。".to_owned()
}

fn missing_key_error() -> String {
    "尚未在 Windows 凭据管理器中保存该 AI 平台的 API Key。".to_owned()
}

fn migration_verify_error() -> String {
    "AI 平台凭据迁移校验未完成，可在设置中重试。".to_owned()
}

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

pub(crate) fn save_provider_key_with_coordinator<B: CredentialBackend>(
    coordinator: &CredentialMutationCoordinator,
    backend: &B,
    provider_id: &str,
    value: &str,
) -> Result<(), String> {
    let _mutation = coordinator.lock();
    save_provider_key_unlocked(backend, provider_id, value)
}

pub(crate) fn save_provider_key_with_backend<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
    value: &str,
) -> Result<(), String> {
    save_provider_key_with_coordinator(system_mutation_coordinator(), backend, provider_id, value)
}

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

fn clear_provider_key_with_coordinator<B: CredentialBackend>(
    coordinator: &CredentialMutationCoordinator,
    backend: &B,
    provider_id: &str,
) -> Result<(), String> {
    let _mutation = coordinator.lock();
    clear_provider_key_unlocked(backend, provider_id)
}

pub(crate) fn clear_provider_key_with_backend<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
) -> Result<(), String> {
    clear_provider_key_with_coordinator(system_mutation_coordinator(), backend, provider_id)
}

fn migrate_legacy_dashscope_key_unlocked<B: CredentialBackend>(
    backend: &B,
) -> Result<CredentialMigrationStatus, String> {
    let legacy_key = match backend.get(LEGACY_DASHSCOPE_ACCOUNT) {
        Ok(value) => value,
        Err(CredentialError::Missing) => return Ok(CredentialMigrationStatus::NotNeeded),
        Err(CredentialError::Unavailable) => return Err(unavailable_error()),
    };
    let bailian_account = provider_account(BAILIAN_PROVIDER_ID)?;

    match backend.get(&bailian_account) {
        Ok(current_key) if current_key == legacy_key => {
            backend
                .delete(LEGACY_DASHSCOPE_ACCOUNT)
                .map_err(|_| unavailable_error())?;
            return Ok(CredentialMigrationStatus::Migrated);
        }
        Ok(_) => return Ok(CredentialMigrationStatus::Conflict),
        Err(CredentialError::Unavailable) => return Err(unavailable_error()),
        Err(CredentialError::Missing) => {}
    }

    backend
        .set(&bailian_account, &legacy_key)
        .map_err(|_| unavailable_error())?;
    let readback = backend
        .get(&bailian_account)
        .map_err(|_| unavailable_error())?;
    if readback != legacy_key {
        return Err(migration_verify_error());
    }
    backend
        .delete(LEGACY_DASHSCOPE_ACCOUNT)
        .map_err(|_| unavailable_error())?;
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

pub fn save_provider_key(provider_id: &str, value: &str) -> Result<(), String> {
    save_provider_key_with_backend(&WindowsCredentialBackend, provider_id, value)
}

pub fn read_provider_key(provider_id: &str) -> Result<String, String> {
    read_provider_key_with_backend(&WindowsCredentialBackend, provider_id)
}

pub fn has_provider_key(provider_id: &str) -> Result<bool, String> {
    has_provider_key_with_backend(&WindowsCredentialBackend, provider_id)
}

pub fn clear_provider_key(provider_id: &str) -> Result<(), String> {
    clear_provider_key_with_backend(&WindowsCredentialBackend, provider_id)
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
    save_provider_key(BAILIAN_PROVIDER_ID, value)
}

pub fn read_api_key() -> Result<String, String> {
    read_provider_key(BAILIAN_PROVIDER_ID)
}

pub fn has_api_key() -> bool {
    has_provider_key(BAILIAN_PROVIDER_ID).unwrap_or(false)
}

pub fn clear_api_key() -> Result<(), String> {
    clear_provider_key(BAILIAN_PROVIDER_ID)
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
