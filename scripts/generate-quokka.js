// scripts/generate-quokka.js
const fs = require('fs');
const path = require('path');

// 1. 파일 경로 설정
const statePath = path.join(__dirname, '../json/qoukka.json');
const assetsDir = path.join(__dirname, '../assets');
const outputPath = path.join(__dirname, '../assets/quokka-board.svg');

// 2. 상태 데이터 불러오기
let state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

// 3. 로직 업데이트 (나뭇잎 먹기 & 새 목표 설정)
const techStacks = ['JS', 'TS', 'React', 'Next.js', 'AI'];

// 이전 목표를 먹었다고 기록
state.eaten_leaves[state.current_target] += 1;

// 레벨업 로직 (예: 총 5개를 먹을 때마다 레벨 1 증가)
const totalEaten = Object.values(state.eaten_leaves).reduce((a, b) => a + b, 0);
state.quokka_level = Math.floor(totalEaten / 5) + 1;

// 새로운 목표 나뭇잎 랜덤 지정
state.current_target = techStacks[Math.floor(Math.random() * techStacks.length)];

// 쿼카와 나뭇잎의 새로운 랜덤 좌표 설정 (도화지 크기 800x400 기준)
state.position.x = Math.floor(Math.random() * 600) + 50; // 50 ~ 650
state.position.y = Math.floor(Math.random() * 200) + 100; // 100 ~ 300

const leafX = Math.floor(Math.random() * 600) + 50;
const leafY = Math.floor(Math.random() * 200) + 150;

// 업데이트된 상태 저장
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

// 4. SVG 에셋 불러오기 헬퍼 함수
// SVG 파일 안의 알맹이(<path>, <rect> 등)만 쏙 빼오는 역할입니다.
function getSvgContent(filename) {
  const filePath = path.join(assetsDir, filename);
  if (!fs.existsSync(filePath)) return '';
  const content = fs.readFileSync(filePath, 'utf8');
  // <svg ...> 태그와 </svg> 태그를 제거하고 내부 알맹이만 추출
  return content.replace(/<svg[^>]*>|<\/svg>/g, '');
}

// 에셋 알맹이들 준비
const quokkaContent = getSvgContent('quokka.svg');
const leafFileName = `leaf-${state.current_target.toLowerCase().replace('.', '')}.svg`;
const targetLeafContent = getSvgContent(leafFileName);

// 5. 최종 도화지(SVG) 그리기
const finalSvg = `
<svg width="800" height="400" viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="#FFF8D6" rx="15" />
  
  <text x="30" y="40" font-family="monospace" font-size="20" font-weight="bold" fill="#333">
    Lv.${state.quokka_level} Quokka's Tech Stack
  </text>
  
  <text x="30" y="70" font-family="monospace" font-size="16" fill="#555">
    🍃 JS: ${state.eaten_leaves['JS']} | TS: ${state.eaten_leaves['TS']} | React: ${state.eaten_leaves['React']} | Next.js: ${state.eaten_leaves['Next.js']} | AI: ${state.eaten_leaves['AI']}
  </text>
  <text x="30" y="95" font-family="monospace" font-size="14" fill="#888">
    * Quokka is hunting for [${state.current_target}] today!
  </text>

  <g transform="translate(${leafX}, ${leafY}) scale(1.5)">
    ${targetLeafContent}
  </g>

  <g transform="translate(${state.position.x}, ${state.position.y}) scale(3)">
    ${quokkaContent}
  </g>
</svg>
`;

// 6. 완성된 SVG 파일 저장
fs.writeFileSync(outputPath, finalSvg.trim());
console.log('✅ 쿼카 보드(quokka-board.svg) 생성 완료!');
console.log(`목표: ${state.current_target} / 현재 레벨: ${state.quokka_level}`);