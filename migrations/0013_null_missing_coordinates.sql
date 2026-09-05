-- 좌표 없이 저장된 일정·숙소가 (0,0)으로 기록되어 지도와 경로가 잘못된 위치를 사용했다.
-- 위도 0·경도 0은 실제 여행 장소가 아니므로 좌표 없음으로 되돌린다. 다른 값은 건드리지 않는다.
UPDATE items SET lat = NULL, lng = NULL WHERE lat = 0 AND lng = 0;
UPDATE lodgings SET lat = NULL, lng = NULL WHERE lat = 0 AND lng = 0;
