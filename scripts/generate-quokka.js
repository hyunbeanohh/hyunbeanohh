// scripts/generate-quokka.js
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');

async function generateQuokkaGif() {
  // 1. 경로 설정
  const statePath = path.join(__dirname, '../quokka-state.json');
  const assetsDir = path.join(__dirname, '../assets');
  const outputPath = path.join(__dirname, '../quokka-board.gif'); // 확장자가 gif로 변경됨!

  // 2. 상태 데이터 불러오기
  let state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

  // 파일명 매핑 (나뭇잎 파일명에 맞춤)
  const leafFileNameMap = {
    'JS': 'leaf-js_32.png',
    'TS': 'leaf-ts_32.png',
    'React': 'leaf-react_32.png',
    'Next.js': 'leaf-nextjs_32.png',
    'AI': 'leaf-ai_32.png'
  };

  // 3. 에셋(이미지) 미리 모두 불러오기 (비동기)
  const quokkaDir = path.join(assetsDir, 'quokka');
  const leafDir = path.join(assetsDir, 'leaf');

  const walk1 = await loadImage(path.join(quokkaDir, 'quokka_walk1.png'));
  const walk2 = await loadImage(path.join(quokkaDir, 'quokka_walk2.png'));
  const walk3 = await loadImage(path.join(quokkaDir, 'quokka_walk3.png'));
  const eat = await loadImage(path.join(quokkaDir, 'quokka_eat.png'));

  const currentLeafFileName = leafFileNameMap[state.current_target];
  const leafImg = await loadImage(path.join(leafDir, currentLeafFileName));

  // 4. GIF 인코더 및 캔버스 세팅
  const width = 800;
  const height = 400;
  
  const encoder = new GIFEncoder(width, height);
  encoder.setRepeat(0);   // 0: 무한 반복, -1: 반복 없음
  encoder.setDelay(100);  // 1프레임당 시간 (100ms = 1초에 10프레임)
  encoder.setQuality(10); // 이미지 압축 퀄리티
  encoder.start();

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // 🔥 [핵심] 픽셀 아트가 깨지지 않게 선명하게 유지하는 마법의 옵션!
  ctx.imageSmoothingEnabled = false; 

  // 5. 애니메이션 로직 세팅
  const totalFrames = 40; // 총 40프레임 (약 4초짜리 애니메이션)
  const walkFrames = 25;  // 25프레임 동안 걸어감
  
  const startX = 50; // 쿼카 시작 위치
  const targetX = 400; // 나뭇잎 위치
  const groundY = 220; // 쿼카가 서 있는 바닥 Y좌표 (적절히 조정 가능)

  // 6. 프레임별로 그림 그리기 (Game Loop)
  for (let i = 0; i < totalFrames; i++) {
    // 배경 채우기
    ctx.fillStyle = '#FFF8D6';
    ctx.fillRect(0, 0, width, height);

    // 상단 텍스트(상태창) 그리기
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`Lv.${state.quokka_level} Quokka's Tech Stack`, 30, 40);
    
    ctx.fillStyle = '#555555';
    ctx.font = '18px monospace';
    ctx.fillText(`🍃 JS: ${state.eaten_leaves['JS']} | TS: ${state.eaten_leaves['TS']} | React: ${state.eaten_leaves['React']} | Next.js: ${state.eaten_leaves['Next.js']} | AI: ${state.eaten_leaves['AI']}`, 30, 75);
    
    ctx.fillStyle = '#888888';
    ctx.font = '16px monospace';
    ctx.fillText(`* Quokka is hunting for [${state.current_target}] today!`, 30, 105);

    // 나뭇잎 그리기 (먹기 전까지만 화면에 보임)
    if (i < walkFrames + 5) {
      // 나뭇잎이 위아래로 둥둥 떠다니는 효과 (Math.sin 활용)
      const floatY = Math.sin(i * 0.3) * 5; 
      // 나뭇잎 크기를 64x64 (2배)로 키워서 그림
      ctx.drawImage(leafImg, targetX, groundY + 40 + floatY, 64, 64); 
    }

    // 쿼카 그리기 로직
    let currentX;
    let currentImg;

    if (i < walkFrames) {
      // 걷는 구간 (점점 목표를 향해 이동)
      currentX = startX + ((targetX - startX) * (i / walkFrames));
      
      // 걷는 모션 번갈아가며 보여주기 (walk1 -> walk2 -> walk1 -> walk3)
      const step = i % 4;
      if (step === 0) currentImg = walk1;
      else if (step === 1) currentImg = walk2;
      else if (step === 2) currentImg = walk1;
      else currentImg = walk3;
    } else {
      // 먹는 구간 (제자리에 멈춰서 먹는 이미지로 변경)
      currentX = targetX - 40; // 나뭇잎 바로 앞
      currentImg = eat; // 먹는 이미지!
    }

    // 쿼카 크기를 128x128 (4배)로 키워서 그림
    ctx.drawImage(currentImg, currentX, groundY, 128, 128);

    // 완성된 한 프레임을 인코더에 추가
    encoder.addFrame(ctx);
  }

  // 7. 인코딩 종료 및 파일 저장
  encoder.finish();
  fs.writeFileSync(outputPath, encoder.out.getData());
  console.log('✅ 픽셀 게임 퀄리티의 쿼카 GIF(quokka-board.gif) 생성 완료!');

  // 8. 상태 데이터 업데이트 로직 (내일을 위해)
  const techStacks = ['JS', 'TS', 'React', 'Next.js', 'AI'];
  
  // 지금 먹은 거 기록
  state.eaten_leaves[state.current_target] += 1;
  const totalEaten = Object.values(state.eaten_leaves).reduce((a, b) => a + b, 0);
  state.quokka_level = Math.floor(totalEaten / 5) + 1; // 5개 먹을때마다 레벨업
  
  // 다음 목표 랜덤 지정
  state.current_target = techStacks[Math.floor(Math.random() * techStacks.length)];
  
  // 저장
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(`다음 목표: ${state.current_target} / 현재 레벨: ${state.quokka_level}`);
}

generateQuokkaGif().catch(console.error);