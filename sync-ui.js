(function () {
  'use strict';
  function changedCount(left = [], right = []) {
    const before = new Map((left || []).map(item => [item.id, JSON.stringify(item)]));
    const after = new Map((right || []).map(item => [item.id, JSON.stringify(item)]));
    const ids = new Set([...before.keys(), ...after.keys()]);
    return [...ids].filter(id => before.get(id) !== after.get(id)).length;
  }
  window.createYeogiroSyncUI = function ({ openSheet }) {
    function conflict(detail) {
      const items = changedCount(detail.local.items, detail.remote.items), flights = changedCount(detail.local.flights, detail.remote.flights), lodgings = changedCount(detail.local.lodgings, detail.remote.lodgings);
      const summary = [items && `일정 ${items}개`, flights && `항공편 ${flights}개`, lodgings && `숙소 ${lodgings}개`].filter(Boolean).join(' · ') || '여행 정보가 변경됨';
      const names={trip:'여행 정보',item:'일정',flight:'항공편',lodging:'숙소'},actions={created:'추가',updated:'수정',deleted:'삭제'},rows=(detail.changes||[]).slice(0,12).map(change=>`<div class="diff-row conflict-diff"><span class="diff-values"><b>${names[change.entityType]||'항목'} · ${actions[change.action]||'변경'}</b><span>${String(change.label||'이름 없는 항목').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</span>${change.fields?.length?`<small>${change.fields.join(' · ')}</small>`:''}</span></div>`).join('');
      openSheet(`<h2>다른 기기에서 여행이 변경되었습니다.</h2><div class="form"><div class="help-card"><b>변경된 항목</b>${summary}</div>${rows?`<div class="diff-list">${rows}</div>`:''}<p class="memo">반영할 내용을 선택하기 전에는 어느 기기의 데이터도 덮어쓰지 않습니다.</p><button class="save" data-conflict="remote">다른 기기 변경사항 반영</button><button class="cancel" data-conflict="local">이 기기 변경사항으로 저장</button></div>`);
    }
    function details() {
      const status = YeogiroStore.status();
      if (status.conflict) { conflict(status.conflict); return; }
      const last = status.lastSync ? new Date(status.lastSync).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '아직 없음';
      const headline = !status.online ? '● 오프라인' : status.phase === 'syncing' ? '↻ 동기화 중' : status.pending ? `↑ ${status.pending}건 대기` : '모든 변경사항이 저장되었습니다.';
      const body = !status.online ? `변경사항 ${status.pending}건이 이 기기에 안전하게 저장되어 있습니다.<br>인터넷 연결 후 자동으로 동기화됩니다.` : status.pending ? '저장 대기 중인 변경사항은 자동으로 다시 전송됩니다.' : '대기 중인 변경사항 없음';
      openSheet(`<h2>동기화 상태</h2><div class="form"><div class="help-card"><b>${headline}</b>${body}</div><p class="memo">마지막 동기화 ${last}</p>${status.online ? '<button class="save" data-sync-now>지금 동기화</button>' : ''}<button class="cancel" data-close>닫기</button></div>`);
    }
    function paint(status, element) {
      element.textContent = status.conflict ? '⚠ 확인 필요' : !status.online ? '● 오프라인' : status.phase === 'syncing' ? '↻ 동기화 중' : status.pending ? `↑ ${status.pending}건 대기` : '동기화됨';
      element.dataset.state = status.conflict ? 'conflict' : !status.online ? 'offline' : status.pending ? 'pending' : 'online';
      element.dataset.phase = status.phase || 'idle';
      element.ariaLabel = element.textContent;
      element.title = status.message;
    }
    return { conflict, details, paint };
  };
})();
