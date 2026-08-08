pub mod ai;
pub mod backup;
pub mod credentials;
pub mod ingest;
pub mod material;
pub mod obsidian;

#[cfg(test)]
mod credentials_test;
#[cfg(test)]
mod ingest_test;
#[cfg(test)]
mod material_test;
#[cfg(test)]
mod backup_test;
#[cfg(test)]
mod obsidian_test;
