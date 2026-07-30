use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearchResult {
    pub kind: String,
    pub id: String,
    pub course_id: String,
    pub title: String,
    pub snippet: String,
    pub updated_at: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CountedSignal {
    pub label: String,
    pub count: u32,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDay {
    pub date: String,
    pub count: u32,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CourseSummary {
    pub id: String,
    pub name: String,
    pub color: String,
    pub problem_count: u32,
    pub pending_count: u32,
    pub due_count: u32,
    pub material_count: u32,
    pub updated_at: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentProblem {
    pub id: String,
    pub course_id: String,
    pub course_name: String,
    pub title: String,
    pub fallback_filename: String,
    pub status: String,
    pub updated_at: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DashboardOverview {
    pub due_review_count: u32,
    pub pending_inbox_count: u32,
    pub course_count: u32,
    pub material_count: u32,
    pub course_summaries: Vec<CourseSummary>,
    pub recent_problems: Vec<RecentProblem>,
    pub top_mistake_reasons: Vec<CountedSignal>,
    pub top_knowledge_topics: Vec<CountedSignal>,
    pub activity_last_seven_days: Vec<ActivityDay>,
}
