use super::review::{schedule_next, ReviewGrade};

#[test]
fn schedules_familiar_review_at_two_point_five_times_current_interval() {
    let schedule = schedule_next(4, ReviewGrade::Familiar, "2026-07-21").expect("schedule");

    assert_eq!(schedule.interval_days, 10);
    assert_eq!(schedule.next_review_on, "2026-07-31");
    assert_eq!(schedule.algorithm_version, "v1-deterministic");
}

#[test]
fn caps_mastered_interval_at_180_days() {
    let schedule = schedule_next(100, ReviewGrade::Mastered, "2026-07-21").expect("schedule");

    assert_eq!(schedule.interval_days, 180);
    assert_eq!(schedule.next_review_on, "2027-01-17");
}
