import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { BookMarked, Focus, ZoomIn, ZoomOut } from 'lucide-react';
import { type CSSProperties, type PointerEvent, type WheelEvent, useEffect, useMemo, useRef } from 'react';
import { getMotionPreferences } from '../../lib/preferences';
import type { KnowledgeGraph, KnowledgeTopic } from '../../lib/tauri';
import { layoutKnowledgeGraph } from './knowledgeLayout';

type KnowledgeCanvasProps = {
  graph: KnowledgeGraph;
  selectedTopicId: string | null;
  onSelectTopic: (topic: KnowledgeTopic) => void;
};

export function KnowledgeCanvas({ graph, selectedTopicId, onSelectTopic }: KnowledgeCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const layout = useMemo(() => layoutKnowledgeGraph(graph), [graph]);

  const applyTransform = () => {
    if (!sceneRef.current) return;
    const { x, y, scale } = transformRef.current;
    sceneRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  };

  const scheduleTransform = () => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      applyTransform();
    });
  };

  const zoom = (amount: number) => {
    transformRef.current.scale = Math.min(1.6, Math.max(0.68, transformRef.current.scale + amount));
    scheduleTransform();
  };

  const resetView = () => {
    transformRef.current = { x: 0, y: 0, scale: 1 };
    scheduleTransform();
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('button')) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: transformRef.current.x, originY: transformRef.current.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add('is-panning');
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    transformRef.current.x = drag.originX + event.clientX - drag.x;
    transformRef.current.y = drag.originY + event.clientY - drag.y;
    scheduleTransform();
  };

  const stopPanning = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.classList.remove('is-panning');
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    zoom(event.deltaY > 0 ? -0.08 : 0.08);
  };

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  useGSAP(() => {
    if (getMotionPreferences().reduceMotion || !sceneRef.current) return;
    gsap.fromTo(sceneRef.current.querySelectorAll('.knowledge-node'), { opacity: 0, y: 7, scale: 0.985 }, {
      opacity: 1, y: 0, scale: 1, duration: 0.34, stagger: 0.035, ease: 'back.out(1.12)', clearProps: 'opacity,transform',
    });
  }, { dependencies: [graph], scope: sceneRef });

  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
  return (
    <section aria-label="知识关系图" className="knowledge-canvas">
      <div aria-label="画布工具" className="knowledge-canvas-tools">
        <button aria-label="缩小知识图" onClick={() => zoom(-0.12)} type="button"><ZoomOut aria-hidden="true" size={16} /></button>
        <button aria-label="还原知识图位置" onClick={resetView} type="button"><Focus aria-hidden="true" size={16} /></button>
        <button aria-label="放大知识图" onClick={() => zoom(0.12)} type="button"><ZoomIn aria-hidden="true" size={16} /></button>
      </div>
      <div
        className="knowledge-canvas-viewport"
        onPointerCancel={stopPanning}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPanning}
        onWheel={handleWheel}
        ref={viewportRef}
      >
        <div className="knowledge-scene" ref={sceneRef} style={{ width: layout.width, height: layout.height }}>
          <svg aria-hidden="true" height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width}>
            {layout.edges.map((edge) => <path className="knowledge-edge" d={edge.path} key={edge.id} />)}
          </svg>
          {graph.courses.map((course) => {
            const node = nodesById.get(course.id);
            if (!node) return null;
            return (
              <div className="knowledge-node knowledge-course-node" key={course.id} style={{ '--course-color': course.color, left: node.x, top: node.y, width: node.width, height: node.height } as CSSProperties}>
                <BookMarked aria-hidden="true" size={18} />
                <span><strong>{course.name}</strong><small>{course.topicCount} 个知识点</small></span>
              </div>
            );
          })}
          {graph.topics.map((topic) => {
            const node = nodesById.get(topic.id);
            if (!node) return null;
            return (
              <button
                aria-pressed={selectedTopicId === topic.id}
                className={`knowledge-node knowledge-topic-node${selectedTopicId === topic.id ? ' is-selected' : ''}`}
                key={topic.id}
                onClick={() => onSelectTopic(topic)}
                style={{ left: node.x, top: node.y, width: node.width, height: node.height } as CSSProperties}
                type="button"
              >
                <span><strong>{topic.name}</strong><small>{topic.problemCount} 题 · 掌握 {topic.masteryScore}</small></span>
                {topic.dueCount ? <em>{topic.dueCount} 待复习</em> : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
