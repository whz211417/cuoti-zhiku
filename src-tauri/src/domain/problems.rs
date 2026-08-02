use serde::Serialize;

#[allow(dead_code)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProblemFieldKind {
    Stem,
    OwnAnswer,
    StandardAnswer,
    Explanation,
    MistakeReason,
    Notes,
}

impl ProblemFieldKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Stem => "stem",
            Self::OwnAnswer => "own_answer",
            Self::StandardAnswer => "standard_answer",
            Self::Explanation => "explanation",
            Self::MistakeReason => "mistake_reason",
            Self::Notes => "notes",
        }
    }

    #[allow(dead_code)]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "stem" => Some(Self::Stem),
            "own_answer" => Some(Self::OwnAnswer),
            "standard_answer" => Some(Self::StandardAnswer),
            "explanation" => Some(Self::Explanation),
            "mistake_reason" => Some(Self::MistakeReason),
            "notes" => Some(Self::Notes),
            _ => None,
        }
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProblemField {
    pub kind: String,
    pub value: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProblemDocument {
    pub id: String,
    pub course_id: String,
    pub has_image_attachment: bool,
    pub title: String,
    pub status: String,
    pub updated_at: String,
    pub version: String,
    pub fields: Vec<ProblemField>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedProblemField {
    pub problem_id: String,
    pub kind: String,
    pub value: String,
    pub updated_at: String,
    pub version: String,
}
