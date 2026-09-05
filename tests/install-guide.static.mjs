import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const source = readFileSync('index.html', 'utf8');
let checks = 0;
const check = () => { checks += 1; };

// ---- 단일 중앙 모달 구조 ----
assert.match(source, /<div class="install-overlay" id="installOverlay" aria-hidden="true"><div class="install-modal" id="installGuide" role="dialog" aria-modal="true" aria-labelledby="installGuideTitle" tabindex="-1">/, '설치 안내는 접근성 속성을 갖춘 단일 모달'); check();
assert.match(source, /setTimeout\(\(\)=>modal\.focus\(\{preventScroll:true\}\),0\)/, '모달을 열면 대화상자로 focus 이동'); check();
assert.match(source, /\.install-overlay\{position:fixed;inset:0;z-index:60;display:none;place-items:center/, '중앙 정렬 오버레이'); check();
assert.match(source, /\.install-modal\{[^}]*max-height:min\(88dvh,720px\);overflow:auto/, '높이를 넘기면 모달 내부만 스크롤'); check();
assert.match(source, /\.install-overlay\{[^}]*env\(safe-area-inset-top\)[^}]*env\(safe-area-inset-bottom\)/, '상하 safe area 확보'); check();
assert.match(source, /id="installGuideTitle">홈 화면에 여기로를 추가하고<br>더 쉽고 편하게 이용해보세요!/, '제목은 두 줄 중앙 정렬 문구'); check();
assert.match(source, /class="install-app-icon" src="\/assets\/icons\/icon-192-v8\.png"/, '여기로 앱 아이콘 사용'); check();
assert.equal(source.includes('여행 중 더 빠르게 열고, 오프라인에서도 일정을 확인할 수 있어요.'), false, '기본 모달에서 긴 보조 설명 제거'); check();
assert.match(source, /data-install-close aria-label="설치 안내 닫기"/, '닫기 버튼에 접근 가능한 이름'); check();
assert.match(source, /<label class="install-optout"><input type="checkbox" id="installOptOut"> 다시 보지 않기<\/label>/, '하단에는 다시 보지 않기만 배치'); check();
assert.equal(/data-install-now/.test(source), false, '기본 모달에 큰 설치 CTA를 두지 않음'); check();
assert.equal(/install-guide-tag|지금 사용 중/.test(source), false, '현재 브라우저 배지 제거'); check();
assert.equal(/상세가이드 보기|설치 안내로 돌아가기/.test(source), false, '상세가이드 진입과 복귀 UI를 제거'); check();

// ---- Chrome / Safari 독립 섹션 ----
const markup = source.match(/function installGuideMarkup\(\)[\s\S]*?\n\}/)?.[0] || '';
assert.match(markup, /\['chrome','safari'\]\.map\(key=>/, 'Chrome과 Safari를 같은 구조의 독립 섹션으로 렌더'); check();
assert.match(markup, /<section class="install-guide"><div class="install-guide-head"><span class="install-guide-name">/, '섹션마다 브라우저 이름 헤더'); check();
assert.match(markup, /<img class="install-guide-logo" src="\$\{guide\.logo\}" alt="" width="26" height="26">/, '브라우저 제목에 실제 로고 이미지를 렌더'); check();
assert.match(source, /\.install-guide-logo\{display:block;width:26px;height:26px;flex:0 0 26px;object-fit:contain\}/, '브라우저 로고를 제목과 조화되는 26px 크기로 표시'); check();
assert.match(source, /\.install-guide\{display:grid;gap:8px;padding:0 0 12px;border-bottom:1px solid var\(--line\)\}/, '섹션 사이 divider'); check();
assert.match(source, /\.install-guides\{display:grid;gap:12px;padding:14px;border-radius:var\(--radius-card\);background:var\(--surface-muted\)\}/, '설치 안내 영역은 연한 neutral 배경'); check();
assert.equal(/install-detail|data-install-detail/.test(source), false, '상세가이드 버튼 전용 CSS와 DOM을 제거'); check();

const guides = source.match(/const INSTALL_GUIDES=\{[\s\S]*?\n\};/)?.[0] || '';
assert.match(guides, /chrome:\{name:'Chrome'/, 'Chrome 안내 정의'); check();
assert.match(guides, /safari:\{name:'Safari'/, 'Safari 안내 정의'); check();
assert.match(guides, /steps:\[\['상단 URL 옆 <b>더보기<\/b> 탭',INSTALL_ICONS\.menu\],\['<b>홈 화면에 추가<\/b> 선택',INSTALL_ICONS\.plus\]\]/, 'Chrome 기본 안내는 2단계'); check();
assert.match(guides, /steps:\[\['하단 <b>공유<\/b> 버튼 탭',INSTALL_ICONS\.share\],\['<b>홈 화면에 추가<\/b> 선택',INSTALL_ICONS\.plus\]\]/, 'Safari 기본 안내는 2단계'); check();
assert.equal(/steps:\[[^\]]*오른쪽 위 <b>추가/.test(guides), false, '오른쪽 위 추가 단계는 기본 안내에서 제외'); check();
assert.equal(/detail:\[|notes:\[/.test(guides), false, '별도 상세가이드 데이터 제거'); check();
assert.match(guides, /logo:'\/assets\/icons\/browser-chrome\.svg'/, 'Chrome 로고는 내부 asset을 사용'); check();
assert.match(guides, /logo:'\/assets\/icons\/browser-safari\.svg'/, 'Safari 로고는 내부 asset을 사용'); check();
assert.match(source, /INSTALL_ICONS=\{share:'<svg/, '공유·추가·메뉴 시스템 아이콘 제공'); check();
assert.match(source, /\.install-step\{display:grid;grid-template-columns:22px minmax\(0,1fr\) 24px/, '단계 번호·설명·시스템 아이콘 고정 배치'); check();
assert.match(source, /\.install-step-no\{[^}]*border-radius:var\(--radius-chip\)/, '단계 번호는 작은 rounded square'); check();

// ---- 브라우저 로고와 단일 안내 화면 ----
assert.equal(source.includes('function installDetailMarkup'), false, '상세가이드 전용 마크업 제거'); check();
assert.equal(/data-install-back|data-install-detail/.test(source), false, '상세가이드 진입·복귀 경로 제거'); check();
assert.equal(/installGuideView|installGuideReason/.test(source), false, '상세 화면 전용 상태값 제거'); check();
assert.match(source, /if\(e\.key==='Escape'\)\{e\.preventDefault\(\);e\.stopImmediatePropagation\(\);closeInstallGuide\(\);return\}/, 'Escape는 설치 모달을 바로 닫음'); check();

// ---- 브라우저 감지는 내부 로직에서 계속 사용 ----
const env = source.match(/function installEnvironment\(\)[\s\S]*?\n\}/)?.[0] || '';
assert.match(env, /iPad\|iPhone\|iPod/, 'iOS 기기 감지'); check();
assert.match(env, /navigator\.platform==='MacIntel'&&navigator\.maxTouchPoints>1/, 'iPad 데스크톱 모드 감지'); check();
assert.match(env, /CriOS/, 'iOS Chrome 감지'); check();
assert.match(env, /KAKAOTALK\|DaumApps\|NAVER\|Instagram\|FBAN\|FBAV\|Line/, '인앱 브라우저 감지'); check();
assert.match(env, /android&&\/Chrome\\\/\/\.test\(ua\)/, 'Android Chrome 감지'); check();
assert.match(env, /SamsungBrowser/, 'Samsung Internet 감지'); check();
assert.match(markup, /inApp\?'<p class="install-inapp">앱 안에서 열린 화면에서는 추가할 수 없어요\./, '인앱 브라우저에서는 제약을 먼저 알림'); check();
assert.match(source, /function standaloneApp\(\)\{return matchMedia\('\(display-mode: standalone\)'\)\.matches\|\|matchMedia\('\(display-mode: window-controls-overlay\)'\)\.matches\|\|navigator\.standalone===true\}/, 'standalone 판단은 display-mode와 iOS 플래그를 함께 사용'); check();
assert.match(source, /function canUseInstallPrompt\(\)\{return Boolean\(installPrompt\)&&!installEnvironment\(\)\.key\.startsWith\('ios'\)\}/, 'iOS에서는 install prompt를 사용하지 않음'); check();
assert.match(source, /async function runInstallPrompt\(\)[\s\S]{0,300}installPrompt\.prompt\(\)/, 'Android 설치 prompt 처리 유지'); check();
assert.match(source, /async function installApp\(\)\{[\s\S]{0,200}if\(canUseInstallPrompt\(\)\)\{await runInstallPrompt\(\);return\}openInstallGuide\(\)\}/, 'prompt를 쓸 수 없으면 단계 안내를 연다'); check();

// ---- 자동 노출 조건 ----
const maybe = source.match(/function maybeShowInstallGuide\(\)[\s\S]*?\n\}/)?.[0] || '';
assert.match(maybe, /if\(standaloneApp\(\)/, 'standalone에서는 자동 노출하지 않음'); check();
assert.match(maybe, /if\(pref\.optOut\|\|shouldShowOnboarding\(\)\)return/, '다시 보지 않기와 첫 실행 온보딩 중에는 노출하지 않음'); check();
assert.match(maybe, /if\(!state\.trips\.some\(t=>!isBlankTrip\(t\)\)\)return/, '실제 여행이 하나 이상 있을 때만 노출'); check();
assert.match(maybe, /if\(pref\.visits\+1<2\)return/, '두 번째 방문부터 노출'); check();
assert.match(maybe, /INSTALL_SNOOZE_DAYS\*86400000/, '닫은 뒤에는 재노출 간격 유지'); check();
assert.match(source, /INSTALL_SNOOZE_DAYS=21/, '재노출 간격 21일'); check();
assert.match(source, /INSTALL_PREF_KEY='yeogiro-install-guide'/, '기기 로컬 preference 사용'); check();
assert.match(source, /function saveInstallPref\(next\)\{try\{localStorage\.setItem/, 'preference는 localStorage에만 저장'); check();
assert.equal(/installPref[\s\S]{0,200}YeogiroStore\.persist/.test(source), false, '설치 preference를 여행 데이터에 저장하지 않음'); check();

// ---- 닫기 정책과 접근성 ----
const close = source.match(/function closeInstallGuide\(\)[\s\S]*?\n\}/)?.[0] || '';
assert.match(close, /optOut:pref\.optOut\|\|optOut,dismissedAt:optOut\?pref\.dismissedAt:new Date\(\)\.toISOString\(\)/, '체크 시 영구 차단, 단순 닫기는 재노출 간격만 적용'); check();
assert.match(close, /installGuideFocus\?\.focus\?\.\(\{preventScroll:true\}\)/, '닫으면 이전 focus로 복귀'); check();
assert.match(close, /if\(!\$\('#overlay'\)\.classList\.contains\('open'\)\)document\.body\.style\.overflow=''/, '다른 시트가 열려 있으면 scroll lock 유지'); check();
assert.match(source, /document\.body\.style\.overflow='hidden'/, '모달을 열면 배경 스크롤 잠금'); check();
assert.match(source, /if\(e\.key!=='Tab'\)return;[\s\S]{0,400}focusable\[focusable\.length-1\]/, 'Tab focus trap 적용'); check();
assert.match(source, /e\.target===overlay\)\{e\.preventDefault\(\);e\.stopImmediatePropagation\(\);closeInstallGuide\(\)\}/, 'backdrop 클릭으로 닫기'); check();

assert.match(source, /<button id="installFromSettings">(?:<img[^>]*>)?홈 화면에 추가<\/button>/, '설정에서 직접 설치 안내를 열 수 있음'); check();
assert.match(source, /if\(b\.id==='installFromSettings'\)\{closeSheet\(\);await installApp\(\);return\}/, '설정 진입점은 install prompt를 우선 사용'); check();
assert.equal(source.includes('function installHelp'), false, '이전 설치 안내 시트는 제거'); check();
assert.match(source, /function appUpdateSheet\(registration=pwaRegistration\)/, '업데이트 안내는 별도 화면으로 유지'); check();
assert.equal(/openInstallGuide[\s\S]{0,120}appUpdateSheet/.test(source), false, '설치 안내와 업데이트 안내를 섞지 않음'); check();

assert.ok(existsSync('assets/icons/browser-chrome.svg')&&existsSync('assets/icons/browser-safari.svg'), '브라우저 로고 asset이 로컬에 존재'); check();
console.log(`${checks} install guide checks passed`);
