import { FormEvent, useEffect, useRef, useState } from 'react';
import { createCourse, getCourses, type Course, type CourseKind } from '../../lib/tauri';

export function CourseSidebar({
  onCancelCourseCreate,
  onCourseCreated,
  openCreateToken,
  onSelectCourse,
  selectedCourseId,
}: {
  onCancelCourseCreate?: () => void;
  onCourseCreated?: (course: Course) => void;
  openCreateToken?: number;
  onSelectCourse: (courseId: string | null) => void;
  selectedCourseId: string | null;
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CourseKind>('school');
  const lastOpenCreateToken = useRef(openCreateToken);
  const creatingRef = useRef(false);

  useEffect(() => { void getCourses().then(setCourses).catch(() => undefined); }, []);
  useEffect(() => {
    if (openCreateToken === undefined || openCreateToken === lastOpenCreateToken.current) return;
    lastOpenCreateToken.current = openCreateToken;
    setCreationError(null);
    setIsAdding(true);
  }, [openCreateToken]);
  const submitCourse = async () => {
    if (!name.trim() || creatingRef.current) return;
    creatingRef.current = true;
    setIsCreating(true);
    setCreationError(null);
    try {
      const course = await createCourse(name.trim(), '', '#7895A5', kind);
      setCourses((current) => [...current, course]);
      setName('');
      setKind('school');
      setIsAdding(false);
      onSelectCourse(course.id);
      onCourseCreated?.(course);
    } catch {
      setCreationError('课程没有创建成功。请检查后重试。');
    } finally {
      creatingRef.current = false;
      setIsCreating(false);
    }
  };
  const addCourse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitCourse();
  };
  const cancelCourseCreation = () => {
    if (creatingRef.current) return;
    setCreationError(null);
    setIsAdding(false);
    onCancelCourseCreate?.();
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
        <form className="course-create" onSubmit={addCourse}>
          <label className="sr-only" htmlFor="course-name">课程名称</label>
          <input autoFocus id="course-name" onChange={(event) => setName(event.target.value)} placeholder="例如：宏观经济学" value={name} />
          <label className="sr-only" htmlFor="course-kind">课程类型</label>
          <select id="course-kind" onChange={(event) => setKind(event.target.value as CourseKind)} value={kind}>
            <option value="school">学校课程</option>
            <option value="exam">考试</option>
            <option value="language">语言</option>
            <option value="certificate">证书</option>
            <option value="other">其他</option>
          </select>
          <div className="course-create-actions">
            <button disabled={isCreating} type="submit">{isCreating ? '正在创建…' : '添加'}</button>
            <button disabled={isCreating} onClick={cancelCourseCreation} type="button">取消</button>
          </div>
          {creationError ? <p aria-live="polite" className="course-create-error" role="alert">{creationError}<button disabled={isCreating} onClick={() => void submitCourse()} type="button">重新尝试</button></p> : null}
        </form>
      ) : <button className="add-course" onClick={() => { setCreationError(null); setIsAdding(true); }} type="button">＋ 新建课程</button>}
    </div>
  );
}
