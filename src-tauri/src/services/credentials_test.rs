use super::credentials::{
    clear_provider_key_with_backend, has_provider_key_with_backend, migrate_legacy_dashscope_key,
    save_provider_key_with_backend, CredentialBackend, CredentialError, MemoryCredentialBackend,
};

const LEGACY_ACCOUNT: &str = "dashscope-api-key";
const BAILIAN_ACCOUNT: &str = "ai-provider:bailian";

#[test]
fn isolates_keys_by_provider_and_migrates_legacy_bailian_key() {
    let backend = MemoryCredentialBackend::default();
    backend.set(LEGACY_ACCOUNT, "legacy-test-key").unwrap();

    migrate_legacy_dashscope_key(&backend).unwrap();

    assert_eq!(backend.get(BAILIAN_ACCOUNT).unwrap(), "legacy-test-key");
    assert!(backend.get(LEGACY_ACCOUNT).is_err());
    save_provider_key_with_backend(&backend, "deepseek", "deepseek-test-key").unwrap();
    assert_eq!(backend.get(BAILIAN_ACCOUNT).unwrap(), "legacy-test-key");
}

#[test]
fn rejects_provider_identifiers_outside_the_safe_account_alphabet() {
    let backend = MemoryCredentialBackend::default();

    for provider_id in [
        "",
        "bailian/other",
        "bailian:other",
        "bailian other",
        "百炼",
    ] {
        assert!(save_provider_key_with_backend(&backend, provider_id, "test-key").is_err());
    }
}

#[test]
fn reports_missing_keys_as_false_and_clears_them_idempotently() {
    let backend = MemoryCredentialBackend::default();

    assert!(!has_provider_key_with_backend(&backend, "moonshot").unwrap());
    clear_provider_key_with_backend(&backend, "moonshot").unwrap();
    clear_provider_key_with_backend(&backend, "moonshot").unwrap();
    assert!(!has_provider_key_with_backend(&backend, "moonshot").unwrap());
}

#[test]
fn leaves_legacy_credential_untouched_when_copy_or_readback_fails() {
    let backend = RejectingWriteBackend::default();
    backend.set(LEGACY_ACCOUNT, "legacy-test-key").unwrap();

    assert!(migrate_legacy_dashscope_key(&backend).is_err());

    assert_eq!(backend.get(LEGACY_ACCOUNT).unwrap(), "legacy-test-key");
}

#[test]
fn preserves_an_existing_provider_key_without_deleting_the_legacy_source() {
    let backend = MemoryCredentialBackend::default();
    backend.set(LEGACY_ACCOUNT, "legacy-test-key").unwrap();
    backend.set(BAILIAN_ACCOUNT, "current-test-key").unwrap();

    migrate_legacy_dashscope_key(&backend).unwrap();

    assert_eq!(backend.get(BAILIAN_ACCOUNT).unwrap(), "current-test-key");
    assert_eq!(backend.get(LEGACY_ACCOUNT).unwrap(), "legacy-test-key");
}

#[derive(Default)]
struct RejectingWriteBackend {
    values: std::sync::Mutex<std::collections::BTreeMap<String, String>>,
}

impl CredentialBackend for RejectingWriteBackend {
    fn get(&self, account: &str) -> Result<String, CredentialError> {
        self.values
            .lock()
            .expect("test backend lock")
            .get(account)
            .cloned()
            .ok_or(CredentialError::Missing)
    }

    fn set(&self, account: &str, value: &str) -> Result<(), CredentialError> {
        if account == BAILIAN_ACCOUNT {
            return Err(CredentialError::Unavailable);
        }
        self.values
            .lock()
            .expect("test backend lock")
            .insert(account.to_owned(), value.to_owned());
        Ok(())
    }

    fn delete(&self, account: &str) -> Result<(), CredentialError> {
        let removed = self
            .values
            .lock()
            .expect("test backend lock")
            .remove(account);
        if removed.is_some() {
            Ok(())
        } else {
            Err(CredentialError::Missing)
        }
    }
}
