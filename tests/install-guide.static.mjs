import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('index.html', 'utf8');
let checks = 0;
const check = () => { checks += 1; };

// 하나의 중앙 모달로 완결
assert.match(source, /<div class="install-overlay" id="installOverlay" aria-hidden="true"><div class="install-modal" id="installGuide" role="dialog" aria-modal="true" aria-labelledby="installGuideTitle" tabindex="-1">/, '설치 안내는 접근성 속성을 갖춘 단일 모달'); check();
assert.match(source, /setTimeout\(\(\)=>modal\.focus\(\{preventScroll:true\}\),0\)/, '모달을 열면 대화상자로 focus 이동'); check();
assert.match(source, /\.install-overlay\{position:fixed;inset:0;z-index:60;display:none;place-items:center/, '중앙 정렬 오버레이'); check();
assert.match(source, /\.install-modal\{[^}]*max-height:min\(88dvh,760px\);overflow:auto/, '작은 화면에서는 모달 내부만 스크롤'); check();
assert.match(source, /\.install-overlay\{[^}]*env\(safe-area-inset-top\)[^}]*env\(safe-area-inset-bottom\)/, '상하 safe area 확보'); check();
assert.match(source, /id="installGuideTitle">홈 화면에 여기로를 추가하세요/, '설치 안내 제목'); check();
assert.match(source, /class="install-app-icon" src="\/assets\/icons\/icon-192-v8\.png"/, '최신 앱 아이콘 사용'); check();
assert.match(source, /여행 중 더 빠르게 열고, 오프라인에서도 일정을 확인할 수 있어요\./, '설치 이유를 한 줄로 설명'); check();
assert.match(source, /data-install-close aria-label="설치 안내 닫기"/, '닫기 버튼에 접근 가능한 이름'); check();
assert.match(source, /<label class="install-optout"><input type="checkbox" id="installOptOut"> 다시 보지 않기<\/label>/, '하단 다시 보지 않기 제공'); check();
assert.match(source, /install-step-no/, '단계 번호 표시'); check();
assert.equal(/상세가이드|AIFuze/.test(source), false, '레퍼런스 사이트 요소를 복제하지 않음'); check();

// 브라우저 감지: 최소 iOS Safari / iOS Chrome / Android Chrome / standalone 구분
const env = source.match(/function installEnvironment\(\)[\s\S]*?\n\}/)?.[0] || '';
assert.match(env, /iPad\|iPhone\|iPod/, 'iOS 기기 감지'); check();
assert.match(env, /navigator\.platform==='MacIntel'&&navigator\.maxTouchPoints>1/, 'iPad 데스크톱 모드 감지'); check();
assert.match(env, /CriOS/, 'iOS Chrome 감지'); check();
assert.match(env, /KAKAOTALK\|DaumApps\|NAVER\|Instagram\|FBAN\|FBAV\|Line/, '인앱 브라우저 감지'); check();
assert.match(env, /android&&\/Chrome\\\/\/\.test\(ua\)/, 'Android Chrome 감지'); check();
assert.match(env, /SamsungBrowser/, 'Samsung Internet 감지'); check();
assert.match(source, /function standaloneApp\(\)\{return matchMedia\('\(display-mode: standalone\)'\)\.matches\|\|matchMedia\('\(display-mode: window-controls-overlay\)'\)\.matches\|\|navigator\.standalone===true\}/, 'standalone 판단은 display-mode와 iOS 플래그를 함께 사용'); check();

// 현재 브라우저 우선 + 잘못된 안내 금지
const guides = source.match(/function installGuides\(env\)[\s\S]*?\n\}/)?.[0] || '';
assert.match(guides, /if\(env\.key==='ios-safari'\)return\[safari,iosChrome\]/, 'Safari에서는 Safari 안내를 먼저 표시'); check();
assert.match(guides, /if\(env\.key==='ios-chrome'\)return\[iosChrome,safari\]/, 'iOS Chrome에서는 Chrome 안내를 먼저 표시'); check();
assert.match(guides, /if\(env\.key==='android-chrome'\)return\[androidChrome,samsung\]/, 'Android Chrome 우선 표시'); check();
assert.match(guides, /return\[generic\]/, '알 수 없는 브라우저는 일반 안내만 제공'); check();
assert.match(guides, /메뉴 이름은 브라우저와 버전에 따라 다를 수 있어요\./, '고정된 메뉴명을 단정하지 않음'); check();
assert.match(guides, /하단 <b>공유<\/b> 버튼을 누르세요/, 'Safari 1단계'); check();
assert.match(guides, /목록에서 <b>홈 화면에 추가<\/b>를 선택하세요/, 'Safari 2단계'); check();
assert.match(guides, /카카오톡·인스타그램 등 앱 안 브라우저에서는 홈 화면에 추가할 수 없어요\./, '인앱 브라우저 제약 안내'); check();
assert.match(source, /INSTALL_ICONS=\{share:'<svg/, '공유·추가·메뉴 시스템 아이콘 제공'); check();

// 설치 prompt가 없는 환경에서는 가짜 CTA 금지
assert.match(source, /\$\{canPrompt\?'<button class="management-primary-action" type="button" data-install-now>홈 화면에 추가<\/button>':''\}/, '실제 install prompt가 있을 때만 설치 CTA 노출'); check();
assert.match(source, /async function runInstallPrompt\(button\)[\s\S]{0,400}installPrompt\.prompt\(\)/, 'CTA는 실제 beforeinstallprompt를 사용'); check();
assert.match(source, /function canUseInstallPrompt\(\)\{return Boolean\(installPrompt\)&&!installEnvironment\(\)\.key\.startsWith\('ios'\)\}/, 'iOS에서는 install prompt를 사용하지 않음'); check();
assert.match(source, /canPrompt=canUseInstallPrompt\(\)/, 'CTA 노출과 실행 조건이 동일'); check();
assert.match(source, /async function installApp\(\)\{[\s\S]{0,200}if\(canUseInstallPrompt\(\)\)\{await runInstallPrompt\(\);return\}openInstallGuide\('manual'\)\}/, 'prompt를 쓸 수 없으면 단계 안내를 연다'); check();

// 자동 노출 조건
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

// 닫기 정책
const close = source.match(/function closeInstallGuide\(\)[\s\S]*?\n\}/)?.[0] || '';
assert.match(close, /optOut:pref\.optOut\|\|optOut,dismissedAt:optOut\?pref\.dismissedAt:new Date\(\)\.toISOString\(\)/, '체크 시 영구 차단, 단순 닫기는 재노출 간격만 적용'); check();
assert.match(close, /installGuideFocus\?\.focus\?\.\(\{preventScroll:true\}\)/, '닫으면 이전 focus로 복귀'); check();
assert.match(close, /if\(!\$\('#overlay'\)\.classList\.contains\('open'\)\)document\.body\.style\.overflow=''/, '다른 시트가 열려 있으면 scroll lock 유지'); check();
assert.match(source, /document\.body\.style\.overflow='hidden';\s*\r?\n?\s*modal\.scrollTop=0/, '모달을 열면 배경 스크롤 잠금'); check();
assert.match(source, /if\(e\.key==='Escape'\)\{e\.preventDefault\(\);e\.stopImmediatePropagation\(\);closeInstallGuide\(\);return\}/, 'Escape로 닫기'); check();
assert.match(source, /if\(e\.key!=='Tab'\)return;[\s\S]{0,400}focusable\[focusable\.length-1\]/, 'Tab focus trap 적용'); check();
assert.match(source, /e\.target===overlay\)\{e\.preventDefault\(\);e\.stopImmediatePropagation\(\);closeInstallGuide\(\)\}/, 'backdrop 클릭으로 닫기'); check();

// 진입점과 업데이트 안내 분리
assert.match(source, /<button id="installFromSettings">📲 홈 화면에 추가<\/button>/, '설정에서 직접 설치 안내를 열 수 있음'); check();
assert.match(source, /if\(b\.id==='installFromSettings'\)\{closeSheet\(\);await installApp\(\);return\}/, '설정 진입점은 install prompt를 우선 사용'); check();
assert.match(source, /async function installApp\(\)\{if\(standaloneApp\(\)\)\{toast\('이미 홈 화면 앱으로 실행 중이에요\.'\)/, '설치된 앱에서는 안내 대신 상태만 알림'); check();
assert.equal(source.includes('function installHelp'), false, '이전 설치 안내 시트는 제거'); check();
assert.match(source, /function appUpdateSheet\(registration=pwaRegistration\)/, '업데이트 안내는 별도 화면으로 유지'); check();
assert.equal(/openInstallGuide[\s\S]{0,120}appUpdateSheet/.test(source), false, '설치 안내와 업데이트 안내를 섞지 않음'); check();

console.log(`${checks} install guide checks passed`);
