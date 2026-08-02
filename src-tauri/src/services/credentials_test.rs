use super::credentials::{
    activate_provider_config_with_backend, assert_active_provider_config_with_backend,
    bound_provider_account, clear_bound_provider_key_with_backend,
    is_active_provider_config_with_backend,
    read_bound_provider_key_with_backend, save_bound_provider_key_with_backend,
    save_bound_provider_key_with_coordinator,
    clear_provider_key_with_backend, has_provider_key_with_backend, migrate_legacy_dashscope_key,
    migrate_legacy_dashscope_key_with_coordinator, save_provider_key_with_backend,
    CredentialBackend, CredentialError,
    CredentialMigrationStatus, CredentialMutationCoordinator, MemoryCredentialBackend,
    record_tested_provider_config_with_backend,
};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use std::thread;

const LEGACY_ACCOUNT: &str = "dashscope-api-key";
const BAILIAN_ENDPOINT: &str = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

fn bailian_account() -> String {
    bound_provider_account("bailian", BAILIAN_ENDPOINT).expect("bound Bailian account")
}

#[test]
fn binds_a_provider_key_to_the_exact_normalized_endpoint() {
    let backend = MemoryCredentialBackend::default();
    let canonical = "https://api.deepseek.com/chat/completions";
    save_bound_provider_key_with_backend(&backend, "deepseek", canonical, "endpoint-key")
        .expect("save endpoint-bound key");

    assert_eq!(
        read_bound_provider_key_with_backend(&backend, "deepseek", canonical).unwrap(),
        "endpoint-key"
    );
    assert!(read_bound_provider_key_with_backend(
        &backend,
        "deepseek",
        "https://attacker.example/chat/completions"
    )
    .is_err());
}

#[test]
fn migrates_an_unbound_builtin_key_only_for_its_canonical_endpoint() {
    let backend = MemoryCredentialBackend::default();
    backend.set("ai-provider:deepseek", "legacy-deepseek-key").unwrap();

    assert!(read_bound_provider_key_with_backend(
        &backend,
        "deepseek",
        "https://attacker.example/chat/completions"
    )
    .is_err());
    assert_eq!(backend.get("ai-provider:deepseek").unwrap(), "legacy-deepseek-key");
    assert_eq!(
        read_bound_provider_key_with_backend(
            &backend,
            "deepseek",
            "https://api.deepseek.com/chat/completions"
        )
        .unwrap(),
        "legacy-deepseek-key"
    );
    assert!(backend.get("ai-provider:deepseek").is_err());
}

#[test]
fn never_migrates_an_unbound_custom_provider_key() {
    let backend = MemoryCredentialBackend::default();
    backend.set("ai-provider:custom-local", "legacy-custom-key").unwrap();

    assert!(read_bound_provider_key_with_backend(
        &backend,
        "custom-local",
        "https://custom.example/chat/completions"
    )
    .is_err());
    assert_eq!(backend.get("ai-provider:custom-local").unwrap(), "legacy-custom-key");
}

#[test]
fn leaves_all_three_slots_untouched_when_legacy_and_unbound_keys_conflict() {
    let backend = MemoryCredentialBackend::default();
    backend.set(LEGACY_ACCOUNT, "older-dashscope-key").unwrap();
    backend.set("ai-provider:bailian", "current-provider-key").unwrap();

    assert_eq!(
        migrate_legacy_dashscope_key(&backend).unwrap(),
        CredentialMigrationStatus::Conflict
    );
    assert!(backend.get(&bailian_account()).is_err());
    assert_eq!(backend.get("ai-provider:bailian").unwrap(), "current-provider-key");
    assert_eq!(backend.get(LEGACY_ACCOUNT).unwrap(), "older-dashscope-key");
}

#[test]
fn clearing_canonical_bailian_removes_every_legacy_source_and_cannot_revive() {
    let backend = MemoryCredentialBackend::default();
    backend.set(LEGACY_ACCOUNT, "legacy-key").unwrap();
    backend.set("ai-provider:bailian", "provider-key").unwrap();
    backend.set(&bailian_account(), "bound-key").unwrap();

    clear_bound_provider_key_with_backend(&backend, "bailian", BAILIAN_ENDPOINT).unwrap();

    assert_eq!(
        migrate_legacy_dashscope_key(&backend).unwrap(),
        CredentialMigrationStatus::NotNeeded
    );
    assert!(read_bound_provider_key_with_backend(&backend, "bailian", BAILIAN_ENDPOINT).is_err());
}

#[test]
fn activation_requires_the_exact_tested_config_and_key_changes_revoke_it() {
    let backend = MemoryCredentialBackend::default();
    let endpoint = "https://api.deepseek.com/chat/completions";
    let current = "config-fingerprint-a";
    save_bound_provider_key_with_backend(&backend, "deepseek", endpoint, "first-key").unwrap();

    assert!(activate_provider_config_with_backend(&backend, "deepseek", endpoint, current).is_err());
    record_tested_provider_config_with_backend(&backend, "deepseek", endpoint, current).unwrap();
    assert!(activate_provider_config_with_backend(&backend, "deepseek", endpoint, "different").is_err());
    activate_provider_config_with_backend(&backend, "deepseek", endpoint, current).unwrap();
    assert!(assert_active_provider_config_with_backend(&backend, current).is_ok());
    assert!(assert_active_provider_config_with_backend(&backend, "different").is_err());

    save_bound_provider_key_with_backend(&backend, "deepseek", endpoint, "replacement-key").unwrap();
    assert!(assert_active_provider_config_with_backend(&backend, current).is_err());
}

#[test]
fn a_marker_delete_failure_never_installs_a_replacement_key_under_old_authorization() {
    let backend = MarkerDeleteFailureBackend::default();
    let endpoint = "https://api.deepseek.com/chat/completions";
    let fingerprint = "approved-config";
    save_bound_provider_key_with_backend(&backend, "deepseek", endpoint, "old-key").unwrap();
    record_tested_provider_config_with_backend(&backend, "deepseek", endpoint, fingerprint).unwrap();
    activate_provider_config_with_backend(&backend, "deepseek", endpoint, fingerprint).unwrap();
    backend.fail_next_active_delete.store(true, Ordering::SeqCst);

    assert!(save_bound_provider_key_with_backend(
        &backend,
        "deepseek",
        endpoint,
        "replacement-key"
    )
    .is_err());
    assert_eq!(
        read_bound_provider_key_with_backend(&backend, "deepseek", endpoint).unwrap(),
        "old-key"
    );
    assert!(!is_active_provider_config_with_backend(
        &backend,
        "deepseek",
        endpoint,
        fingerprint
    )
    .unwrap());
}

#[test]
fn isolates_keys_by_provider_and_migrates_legacy_bailian_key() {
    let backend = MemoryCredentialBackend::default();
    backend.set(LEGACY_ACCOUNT, "legacy-test-key").unwrap();

    assert_eq!(
        migrate_legacy_dashscope_key(&backend).unwrap(),
        CredentialMigrationStatus::Migrated
    );

    assert_eq!(backend.get(&bailian_account()).unwrap(), "legacy-test-key");
    assert!(backend.get(LEGACY_ACCOUNT).is_err());
    save_provider_key_with_backend(&backend, "deepseek", "deepseek-test-key").unwrap();
    assert_eq!(backend.get(&bailian_account()).unwrap(), "legacy-test-key");
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
fn cleans_up_a_matching_legacy_key_on_a_retry_after_the_target_was_written() {
    let backend = MemoryCredentialBackend::default();
    backend.set(LEGACY_ACCOUNT, "legacy-test-key").unwrap();
    backend.set(&bailian_account(), "legacy-test-key").unwrap();

    assert_eq!(
        migrate_legacy_dashscope_key(&backend).unwrap(),
        CredentialMigrationStatus::Migrated
    );

    assert_eq!(backend.get(&bailian_account()).unwrap(), "legacy-test-key");
    assert!(backend.get(LEGACY_ACCOUNT).is_err());
}

#[test]
fn retains_both_distinct_keys_and_reports_a_safe_conflict() {
    let backend = MemoryCredentialBackend::default();
    backend.set(LEGACY_ACCOUNT, "legacy-test-key").unwrap();
    backend.set(&bailian_account(), "current-test-key").unwrap();

    assert_eq!(
        migrate_legacy_dashscope_key(&backend).unwrap(),
        CredentialMigrationStatus::Conflict
    );

    assert_eq!(backend.get(&bailian_account()).unwrap(), "current-test-key");
    assert_eq!(backend.get(LEGACY_ACCOUNT).unwrap(), "legacy-test-key");
}

#[test]
fn retains_legacy_key_when_target_readback_does_not_match() {
    let backend = ReadbackMismatchBackend::default();
    backend.set(LEGACY_ACCOUNT, "legacy-test-key").unwrap();

    assert!(migrate_legacy_dashscope_key(&backend).is_err());

    assert_eq!(backend.get(LEGACY_ACCOUNT).unwrap(), "legacy-test-key");
}

#[test]
fn retries_cleanup_after_the_legacy_delete_initially_fails() {
    let backend = FailOnceDeleteBackend::default();
    backend.set(LEGACY_ACCOUNT, "legacy-test-key").unwrap();

    assert!(migrate_legacy_dashscope_key(&backend).is_err());
    assert_eq!(backend.get(&bailian_account()).unwrap(), "legacy-test-key");
    assert_eq!(backend.get(LEGACY_ACCOUNT).unwrap(), "legacy-test-key");

    assert_eq!(
        migrate_legacy_dashscope_key(&backend).unwrap(),
        CredentialMigrationStatus::Migrated
    );
    assert!(backend.get(LEGACY_ACCOUNT).is_err());
}

#[test]
fn serializes_migration_and_save_so_a_later_save_cannot_be_overwritten() {
    let (backend, target_checked, release_target_read) = BlockingTargetReadBackend::new();
    let backend = Arc::new(backend);
    backend.set(LEGACY_ACCOUNT, "legacy-test-key").unwrap();
    let coordinator = Arc::new(CredentialMutationCoordinator::default());

    let migration_backend = Arc::clone(&backend);
    let migration_coordinator = Arc::clone(&coordinator);
    let migration = thread::spawn(move || {
        migrate_legacy_dashscope_key_with_coordinator(&migration_coordinator, &*migration_backend)
    });

    target_checked.recv().expect("migration checked the target");
    assert!(coordinator.is_locked_for_test());

    let save_backend = Arc::clone(&backend);
    let save_coordinator = Arc::clone(&coordinator);
    let save = thread::spawn(move || {
        save_bound_provider_key_with_coordinator(
            &save_coordinator,
            &*save_backend,
            "bailian",
            BAILIAN_ENDPOINT,
            "saved-test-key",
        )
    });

    release_target_read.send(()).expect("release migration");
    assert_eq!(
        migration.join().expect("migration thread").unwrap(),
        CredentialMigrationStatus::Migrated
    );
    save.join().expect("save thread").unwrap();
    assert_eq!(backend.get(&bailian_account()).unwrap(), "saved-test-key");
}

#[derive(Default)]
struct MarkerDeleteFailureBackend {
    inner: MemoryCredentialBackend,
    fail_next_active_delete: AtomicBool,
}

impl CredentialBackend for MarkerDeleteFailureBackend {
    fn get(&self, account: &str) -> Result<String, CredentialError> {
        self.inner.get(account)
    }

    fn set(&self, account: &str, value: &str) -> Result<(), CredentialError> {
        self.inner.set(account, value)
    }

    fn delete(&self, account: &str) -> Result<(), CredentialError> {
        if account == "ai-active-config-fingerprint"
            && self.fail_next_active_delete.swap(false, Ordering::SeqCst)
        {
            return Err(CredentialError::Unavailable);
        }
        self.inner.delete(account)
    }
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
        if account == bailian_account() {
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

#[derive(Default)]
struct ReadbackMismatchBackend {
    values: Mutex<std::collections::BTreeMap<String, String>>,
}

impl CredentialBackend for ReadbackMismatchBackend {
    fn get(&self, account: &str) -> Result<String, CredentialError> {
        self.values
            .lock()
            .expect("test backend lock")
            .get(account)
            .cloned()
            .ok_or(CredentialError::Missing)
    }

    fn set(&self, account: &str, value: &str) -> Result<(), CredentialError> {
        let stored_value = if account == bailian_account() {
            "different-test-key"
        } else {
            value
        };
        self.values
            .lock()
            .expect("test backend lock")
            .insert(account.to_owned(), stored_value.to_owned());
        Ok(())
    }

    fn delete(&self, account: &str) -> Result<(), CredentialError> {
        self.values
            .lock()
            .expect("test backend lock")
            .remove(account)
            .map(|_| ())
            .ok_or(CredentialError::Missing)
    }
}

#[derive(Default)]
struct FailOnceDeleteBackend {
    values: Mutex<std::collections::BTreeMap<String, String>>,
    fails_next_legacy_delete: AtomicBool,
}

impl CredentialBackend for FailOnceDeleteBackend {
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
        if account == LEGACY_ACCOUNT && !self.fails_next_legacy_delete.swap(true, Ordering::SeqCst)
        {
            return Err(CredentialError::Unavailable);
        }
        self.values
            .lock()
            .expect("test backend lock")
            .remove(account)
            .map(|_| ())
            .ok_or(CredentialError::Missing)
    }
}

struct BlockingTargetReadBackend {
    values: Mutex<std::collections::BTreeMap<String, String>>,
    should_block_target_read: AtomicBool,
    target_checked: mpsc::Sender<()>,
    release_target_read: Mutex<mpsc::Receiver<()>>,
}

impl BlockingTargetReadBackend {
    fn new() -> (Self, mpsc::Receiver<()>, mpsc::Sender<()>) {
        let (target_checked, target_checked_receiver) = mpsc::channel();
        let (release_target_read_sender, release_target_read) = mpsc::channel();
        (
            Self {
                values: Mutex::new(std::collections::BTreeMap::new()),
                should_block_target_read: AtomicBool::new(true),
                target_checked,
                release_target_read: Mutex::new(release_target_read),
            },
            target_checked_receiver,
            release_target_read_sender,
        )
    }
}

impl CredentialBackend for BlockingTargetReadBackend {
    fn get(&self, account: &str) -> Result<String, CredentialError> {
        if account == bailian_account() && self.should_block_target_read.swap(false, Ordering::SeqCst)
        {
            self.target_checked.send(()).expect("test migration signal");
            self.release_target_read
                .lock()
                .expect("test release lock")
                .recv()
                .expect("test migration release");
        }
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
        self.values
            .lock()
            .expect("test backend lock")
            .remove(account)
            .map(|_| ())
            .ok_or(CredentialError::Missing)
    }
}
