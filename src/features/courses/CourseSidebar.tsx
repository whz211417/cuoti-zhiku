import { FormEvent, useEffect, useState } from 'react';
import { createCourse, getCourses, type Course } from '../../lib/tauri';

export function CourseSidebar({
  onCourseCreated,
  onSelectCourse,
  selectedCourseId,
}: {
  onCourseCreated?: () => void;
  onSelectCourse: (courseId: string | null) => void;
  selectedCourseId: string | null;
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => { void getCourses().then(setCourses).catch(() => undefined); }, []);
  const addCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    const course = await createCourse(name, '', '#7895A5');
    setCourses((current) => [...current, course]);
    setName('');
    setIsAdding(false);
    onSelectCourse(course.id);
    onCourseCreated?.();
  };

  return (
    <div className="course-sidebar">
      <p className="sidebar-label">课程</p>
      <button className={`course-row ${selectedCourseId === null ? 'is-selected' : ''}`} onClick={() => onSelectCourse(null)} type="button">
        <i className="course-dot course-dot-econ" />未分类
      </button>
      {courses.map((course) => (
        <button aria-label={course.name} className={`course-row ${selectedCourseId === course.id ? 'is-selected' : ''}`} key={course.id} onClick={() => onSelectCourse(course.id)} type="button">
          <i className="course-dot" style={{ background: course.color }} />{course.name}
        </button>
      ))}
      {isAdding ? (
        <form className="course-create" onSubmit={(event) => void addCourse(event)}>
          <label className="sr-only" htmlFor="course-name">课程名称</label>
          <input autoFocus id="course-name" onChange={(event) => setName(event.target.value)} placeholder="例如：宏观经济学" value={name} />
          <button type="submit">添加</button>
        </form>
      ) : <button className="add-course" onClick={() => setIsAdding(true)} type="button">＋ 新建课程</button>}
    </div>
  );
}
