use chrono::{Duration, NaiveDate};
use serde::Serialize;

#[allow(dead_code)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReviewGrade {
    Forgot,
    Hard,
    Familiar,
    Mastered,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSchedule {
    pub interval_days: u32,
    pub next_review_on: String,
    pub algorithm_version: String,
}

pub fn schedule_next(current_interval_days: u32, grade: ReviewGrade, reviewed_on: &str) -> Result<ReviewSchedule, String> {
    let current = current_interval_days.max(1);
    let interval_days = match grade {
        ReviewGrade::Forgot => 1,
        ReviewGrade::Hard => (current.saturating_mul(3) + 1) / 2,
        ReviewGrade::Familiar => current.saturating_mul(5) / 2,
        ReviewGrade::Mastered => current.saturating_mul(4),
    }.clamp(1, 180);
    let reviewed_on = NaiveDate::parse_from_str(reviewed_on, "%Y-%m-%d")
        .map_err(|_| "复习日期格式无效。".to_owned())?;
    let next_review_on = reviewed_on + Duration::days(i64::from(interval_days));
    Ok(ReviewSchedule {
        interval_days,
        next_review_on: next_review_on.format("%Y-%m-%d").to_string(),
        algorithm_version: "v1-deterministic".to_owned(),
    })
}
