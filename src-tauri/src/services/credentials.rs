#![cfg_attr(test, allow(dead_code))]

const SERVICE: &str = "com.cuoti.zhiku";
const LEGACY_DASHSCOPE_ACCOUNT: &str = "dashscope-api-key";
const BAILIAN_PROVIDER_ID: &str = "bailian";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum CredentialError {
    Missing,
    Unavailable,
}

pub(crate) trait CredentialBackend {
    fn get(&self, account: &str) -> Result<String, CredentialError>;
    fn set(&self, account: &str, value: &str) -> Result<(), CredentialError>;
    fn delete(&self, account: &str) -> Result<(), CredentialError>;
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

pub(crate) fn save_provider_key_with_backend<B: CredentialBackend>(
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

pub(crate) fn clear_provider_key_with_backend<B: CredentialBackend>(
    backend: &B,
    provider_id: &str,
) -> Result<(), String> {
    let account = provider_account(provider_id)?;
    match backend.delete(&account) {
        Ok(()) | Err(CredentialError::Missing) => Ok(()),
        Err(CredentialError::Unavailable) => Err(unavailable_error()),
    }
}

pub(crate) fn migrate_legacy_dashscope_key<B: CredentialBackend>(
    backend: &B,
) -> Result<(), String> {
    let legacy_key = match backend.get(LEGACY_DASHSCOPE_ACCOUNT) {
        Ok(value) => value,
        Err(CredentialError::Missing) => return Ok(()),
        Err(CredentialError::Unavailable) => return Err(unavailable_error()),
    };
    let bailian_account = provider_account(BAILIAN_PROVIDER_ID)?;

    match backend.get(&bailian_account) {
        Ok(_) => return Ok(()),
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
        return Err("AI 平台凭据迁移校验失败，请稍后重试。".to_owned());
    }
    backend
        .delete(LEGACY_DASHSCOPE_ACCOUNT)
        .map_err(|_| unavailable_error())
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

pub fn migrate_legacy_dashscope_key_on_startup() -> Result<(), String> {
    migrate_legacy_dashscope_key(&WindowsCredentialBackend)
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
    values: std::sync::Mutex<std::collections::BTreeMap<String, String>>,
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
