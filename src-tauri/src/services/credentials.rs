#![cfg_attr(test, allow(dead_code))]

const SERVICE: &str = "com.cuoti.zhiku";
const ACCOUNT: &str = "dashscope-api-key";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|error| error.to_string())
}

pub fn save_api_key(value: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("API Key 不能为空。".to_owned());
    }
    entry()?
        .set_password(value)
        .map_err(|error| error.to_string())
}

pub fn read_api_key() -> Result<String, String> {
    entry()?
        .get_password()
        .map_err(|_| "尚未在 Windows 凭据管理器中保存 API Key。".to_owned())
}

pub fn has_api_key() -> bool {
    read_api_key().is_ok()
}

pub fn clear_api_key() -> Result<(), String> {
    entry()?
        .delete_credential()
        .map_err(|error| error.to_string())
}
