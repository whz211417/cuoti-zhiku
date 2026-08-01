import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import type { CourseSummary } from '../../lib/tauri';
import { readableLocalUpdate } from '../../lib/dates';

type CourseShelfProps = {
  courses: CourseSummary[];
  onOpenCourse: (id: string) => void;
};

type CourseColorStyle = CSSProperties & {
  '--course-color': string;
};

export function CourseShelf({ courses, onOpenCourse }: CourseShelfProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleCourses = isExpanded ? courses : courses.slice(0, 4);

  return (
    <section aria-labelledby="course-shelf-title" className="dashboard-section dashboard-course-shelf">
      <header className="dashboard-section-heading">
        <div>
          <p className="eyebrow">课程书架</p>
          <h2 id="course-shelf-title">按课程继续学习</h2>
        </div>
        {courses.length > 4 ? (
          <button
            aria-expanded={isExpanded}
            className="dashboard-text-action"
            onClick={() => setIsExpanded((expanded) => !expanded)}
            type="button"
          >
            {isExpanded ? <ChevronUp aria-hidden="true" size={15} /> : <ChevronDown aria-hidden="true" size={15} />}
            {isExpanded ? '收起' : '展开全部'}
          </button>
        ) : null}
      </header>
      {visibleCourses.length > 0 ? (
        <ul className="dashboard-course-list">
          {visibleCourses.map((course) => (
            <li key={course.id}>
              <button
                aria-label={`打开 ${course.name}`}
                className="dashboard-course"
                onClick={() => onOpenCourse(course.id)}
                style={{ '--course-color': course.color } as CourseColorStyle}
                type="button"
              >
                <span aria-hidden="true" className="dashboard-course-mark"><BookOpen size={17} /></span>
                <span className="dashboard-course-copy">
                  <strong>{course.name}</strong>
                  <span>{course.problemCount} 道题 · {course.materialCount} 份资料</span>
                  <small>{readableLocalUpdate(course.updatedAt)}</small>
                </span>
                <span className="dashboard-course-status">
                  <span>{course.dueCount} 待复习</span>
                  <span>{course.pendingCount} 待整理</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dashboard-empty">还没有课程概览。创建课程后，这里会汇总学习进度。</p>
      )}
    </section>
  );
}
