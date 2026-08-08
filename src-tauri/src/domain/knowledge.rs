use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeCourse {
    pub id: String,
    pub name: String,
    pub color: String,
    pub topic_count: usize,
    pub problem_count: usize,
    pub due_count: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeProblem {
    pub id: String,
    pub course_id: String,
    pub title: String,
    pub status: String,
    pub due: bool,
    pub last_reviewed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeTopic {
    pub id: String,
    pub course_id: String,
    pub name: String,
    pub problem_count: usize,
    pub due_count: usize,
    pub mastery_score: u8,
    pub last_reviewed_at: Option<String>,
    pub mistake_reasons: Vec<String>,
    pub problem_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEdge {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraph {
    pub courses: Vec<KnowledgeCourse>,
    pub topics: Vec<KnowledgeTopic>,
    pub problems: Vec<KnowledgeProblem>,
    pub edges: Vec<KnowledgeEdge>,
}
