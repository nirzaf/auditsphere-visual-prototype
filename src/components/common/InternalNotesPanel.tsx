import React, { useMemo, useState } from 'react';
import { CommentItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { canOpenRoute, isClientRole, visibleClientIds, visibleEngagementIds } from '../../services/guards';

type SubjectType = 'client' | 'engagement';

export function InternalNotesPanel({ subjectType, subjectId }: { subjectType: SubjectType; subjectId: string }) {
  const state = prototypeStore.getSnapshot();
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const comments = state.comments.filter(comment => comment.subjectType === subjectType && comment.subjectId === subjectId && comment.visibility === 'internal');
  const eligibleUsers = useMemo(() => state.users.filter(user => {
    if (user.status !== 'Active' || isClientRole(user.role) || !canOpenRoute(user.role, 'jobs')) return false;
    if (subjectType === 'client') {
      const visible = visibleClientIds(state, user.id);
      return visible === 'ALL' || visible.includes(subjectId);
    }
    const visible = visibleEngagementIds(state, user.id);
    return visible === 'ALL' || visible.includes(subjectId);
  }), [state, subjectType, subjectId]);
  const localNotices = (state.localNotices || []).filter(item => {
    if (item.recipientUserId !== state.currentUserId) return false;
    const comment = state.comments.find(record => record.id === item.commentId);
    return comment?.subjectType === subjectType && comment.subjectId === subjectId;
  });
  const isModerator = ['manager', 'partner'].includes(state.currentRole);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editingId) prototypeStore.editComment(editingId, text);
      else {
        const comment: CommentItem = {
          id: `CMT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          subjectType, subjectId, author: state.currentPerson, authorRole: state.currentRole,
          createdAt: new Date().toISOString(), text: text.trim(), visibility: 'internal', mentions
        };
        prototypeStore.addComment(comment);
      }
      setText(''); setMentions([]); setEditingId(null); setNotice(editingId ? 'Internal note updated.' : 'Internal note saved.');
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };

  return <section className="panel panel-pad stack" aria-label="Internal notes" style={{ gap: 12 }}>
    <div><h3>Internal notes</h3><p className="caption">Visible to authorized staff only. Mentions create local notices for the selected people.</p></div>
    {notice && <div role="status" className="caption">{notice}</div>}
    <form className="stack" onSubmit={save}>
      <label className="caption" htmlFor={`internal-note-${subjectId}`}>Add a note<textarea id={`internal-note-${subjectId}`} aria-label="Internal note text" className="input" required maxLength={5000} value={text} onChange={event => setText(event.target.value)} /></label>
      <label className="caption">Mention authorized staff (optional)<select aria-label="Internal note mentions" className="input" multiple value={mentions} onChange={event => setMentions([...event.target.selectedOptions].map(option => option.value))}>{eligibleUsers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
      <div className="row"><button className="btn primary sm" type="submit">{editingId ? 'Save Note Changes' : 'Save Internal Note'}</button>{editingId && <button className="btn ghost sm" type="button" onClick={() => { setEditingId(null); setText(''); }}>Cancel edit</button>}</div>
    </form>
    {localNotices.length > 0 && <div className="borderbox stack" aria-label="My Local Notices"><b>My Local Notices ({localNotices.filter(item => !item.readAt).length} unread)</b>{localNotices.map(item => <div className="row" key={item.id}><span className="caption">Someone mentioned you on this {subjectType}.</span>{!item.readAt && <button type="button" className="btn sm ghost" onClick={() => prototypeStore.markLocalNoticeRead(item.id)}>Mark read</button>}</div>)}</div>}
    {comments.length ? comments.map(comment => {
      const hidden = comment.moderationHistory?.at(-1)?.action === 'Hidden';
      if (hidden && !isModerator) return null;
      return <article className="borderbox stack" key={comment.id} style={{ gap: 6 }}>
        <div className="between"><b>{comment.author}{comment.edited ? ' · edited' : ''}</b><time className="caption">{new Date(comment.createdAt).toLocaleString()}</time></div>
        <p>{comment.text}</p>
        {hidden && <p className="caption">Hidden by moderator · {comment.moderationHistory?.at(-1)?.reason}</p>}
        {!hidden && comment.author === state.currentPerson && <button type="button" className="btn sm ghost" aria-label={`Edit internal note ${comment.id}`} onClick={() => { setEditingId(comment.id); setText(comment.text); }}>Edit note</button>}
      </article>;
    }) : <p className="caption">No internal notes yet.</p>}
  </section>;
}
