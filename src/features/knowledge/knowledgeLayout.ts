import type { KnowledgeGraph } from '../../lib/tauri';

export type KnowledgeLayoutNode = {
  id: string;
  kind: 'course' | 'topic';
  x: number;
  y: number;
  width: number;
  height: number;
};

export type KnowledgeLayoutEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  path: string;
};

export type KnowledgeLayout = {
  width: number;
  height: number;
  nodes: KnowledgeLayoutNode[];
  edges: KnowledgeLayoutEdge[];
};

const COURSE_X = 72;
const TOPIC_X = 360;
const SECOND_TOPIC_X = 632;
const TOPICS_PER_COLUMN = 6;
const TOPIC_RHYTHM = 88;

export function layoutKnowledgeGraph(graph: KnowledgeGraph): KnowledgeLayout {
  const nodes: KnowledgeLayoutNode[] = [];
  const edges: KnowledgeLayoutEdge[] = [];
  let groupTop = 92;

  graph.courses.forEach((course) => {
    const topics = graph.topics.filter((topic) => topic.courseId === course.id);
    const rowCount = Math.max(1, Math.min(TOPICS_PER_COLUMN, topics.length));
    const groupHeight = Math.max(212, rowCount * TOPIC_RHYTHM);
    const courseNode: KnowledgeLayoutNode = {
      id: course.id,
      kind: 'course',
      x: COURSE_X,
      y: groupTop + 62,
      width: 192,
      height: 76,
    };
    nodes.push(courseNode);

    topics.forEach((topic, index) => {
      const column = Math.floor(index / TOPICS_PER_COLUMN);
      const row = index % TOPICS_PER_COLUMN;
      const topicNode: KnowledgeLayoutNode = {
        id: topic.id,
        kind: 'topic',
        x: column === 0 ? TOPIC_X : SECOND_TOPIC_X,
        y: groupTop + row * TOPIC_RHYTHM,
        width: 216,
        height: 64,
      };
      nodes.push(topicNode);

      const sourceX = courseNode.x + courseNode.width;
      const sourceY = courseNode.y + courseNode.height / 2;
      const targetX = topicNode.x;
      const targetY = topicNode.y + topicNode.height / 2;
      const middleX = sourceX + (targetX - sourceX) * 0.48;
      edges.push({
        id: `layout-${course.id}-${topic.id}`,
        sourceId: course.id,
        targetId: topic.id,
        path: `M ${sourceX} ${sourceY} C ${middleX} ${sourceY}, ${middleX} ${targetY}, ${targetX} ${targetY}`,
      });
    });

    groupTop += groupHeight + 52;
  });

  const hasSecondColumn = graph.topics.some((_, index) => index >= TOPICS_PER_COLUMN);
  return {
    width: hasSecondColumn ? 920 : 680,
    height: Math.max(380, groupTop - 52),
    nodes,
    edges,
  };
}
