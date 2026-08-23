(function(){
'use strict';
function updateState(status={},hasWaiting=false,online=true){
  if(status.conflict)return{ready:false,code:'conflict',title:'동기화 확인 필요',detail:'다른 기기 변경사항을 먼저 확인한 뒤 업데이트해 주세요.'};
  if(Number(status.pending)>0)return{ready:false,code:'pending',title:`저장 대기 ${status.pending}건`,detail:'변경사항을 서버에 저장한 뒤 업데이트할 수 있습니다.'};
  if(!hasWaiting)return{ready:false,code:online?'latest':'offline',title:online?'최신 버전 사용 중':'인터넷 연결 필요',detail:online?'현재 사용할 수 있는 최신 버전입니다.':'인터넷에 연결한 뒤 새 버전을 확인해 주세요.'};
  return{ready:true,code:'ready',title:'새 버전 준비 완료',detail:'일정과 예약 원본은 그대로 유지됩니다.'};
}
window.YeogiroPwa={updateState};
})();
