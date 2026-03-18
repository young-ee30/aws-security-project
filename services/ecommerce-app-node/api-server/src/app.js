/**
 * 이커머스 API 서버 (쿠팡 스타일)
 * - AWS 교육용 프로젝트
 * - 로컬 모드 (Day 1-2): SQLite + 로컬 파일 + 인메모리 캐시
 * - AWS 모드 (Day 3-5): MySQL(RDS) + S3 + DynamoDB + Redis
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const { initDatabase, query } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 5000;

const promClient = require('prom-client');

// ========================================
// 미들웨어 설정
// ========================================

// CORS 설정 (모든 출처 허용 - 개발용)
app.use(cors());

// JSON 바디 파싱
app.use(express.json());

// URL-encoded 바디 파싱
app.use(express.urlencoded({ extended: true }));

// 정적 파일 서빙 (업로드된 이미지)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// S3 이미지 URL → Pre-signed URL 변환 미들웨어
const presignUrlsMiddleware = require('./middleware/presignUrls');
app.use('/api', presignUrlsMiddleware);

promClient.collectDefaultMetrics();

const httpRequestCounter = new promClient.Counter({
name: 'http_requests_total',
help: '총 HTTP 요청 횟수 및 상태 코드',
labelNames: ['method', 'route', 'status_code']
});

const httpRequestDurationMicroseconds = new promClient.Histogram({
name: 'http_request_duration_ms',
help: 'HTTP 응답 지연 시간 (밀리초)',
labelNames: ['method', 'route', 'status_code'],
buckets: [10, 50, 100, 250, 500, 1000, 5000]
});

app.use((req, res, next) => {
const start = Date.now();

res.on('finish', () => {
const duration = Date.now() - start;
httpRequestCounter.labels(req.method, req.path, res.statusCode).inc();
httpRequestDurationMicroseconds.labels(req.method, req.path, res.statusCode).observe(duration);
});

next();
});

// ========================================
// 라우트 설정
// ========================================

// 인증
app.use('/api/auth', require('./routes/auth'));

// 상품
app.use('/api/products', require('./routes/products'));

// 리뷰 (상품 하위 라우트)
app.use('/api/products/:id/reviews', require('./routes/reviews'));

// 장바구니
app.use('/api/cart', require('./routes/cart'));

// 주문
app.use('/api/orders', require('./routes/orders'));

// 파일 업로드
app.use('/api/upload', require('./routes/upload'));

// ========================================
// 헬스 체크 및 설정 확인 엔드포인트
// ========================================

/**
 * GET /api/health - 서버 상태 확인
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    config: {
      dbType: process.env.DB_TYPE || 'sqlite',
      storageType: process.env.STORAGE_TYPE || 'local',
      reviewStore: process.env.REVIEW_STORE || 'local',
      cacheType: process.env.CACHE_TYPE || 'memory',
      queueType: process.env.QUEUE_TYPE || 'sync',
    },
  });
});

/**
 * GET /api/config - 현재 서비스 설정 확인
 */
app.get('/api/config', (req, res) => {
  res.json({
    storageType: process.env.STORAGE_TYPE || 'local',
    reviewStore: process.env.REVIEW_STORE || 'local',
    dbType: process.env.DB_TYPE || 'sqlite',
  });
});

app.get('/api/metrics', async (req, res) => {
res.set('Content-Type', promClient.register.contentType);
res.end(await promClient.register.metrics());
});

// ========================================
// 에러 핸들링
// ========================================

// 404 처리
app.use((req, res) => {
  res.status(404).json({ error: '요청한 리소스를 찾을 수 없습니다' });
});

// 전역 에러 핸들러
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  res.status(err.status || 500).json({
    error: err.message || '서버 내부 오류가 발생했습니다',
  });
});

// ========================================
// 서버 시작
// ========================================

async function seedIfEmpty() {
  try {
    const bcrypt = require('bcryptjs');

    const users = await query('SELECT COUNT(*) as count FROM users', []);
    if (users[0].count === 0) {
      const hash = await bcrypt.hash('password123', 10);
      await query('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)', ['test@test.com', hash, '테스트유저']);
      console.log('[Seed] 테스트 사용자 생성 완료');
    }

    const prods = await query('SELECT COUNT(*) as count FROM products', []);
    if (prods[0].count === 0) {
      const products = [
        { name: '삼성 갤럭시 S24 울트라', description: '최신 AI 기능을 탑재한 프리미엄 스마트폰.', price: 1698000, image_url: '/images/products/product-1.jpg', category: '전자기기', stock: 50 },
        { name: 'LG 그램 17인치 노트북', description: '초경량 17인치 노트북. 인텔 13세대 프로세서.', price: 1890000, image_url: '/images/products/product-2.jpg', category: '전자기기', stock: 30 },
        { name: '애플 에어팟 프로 2세대', description: '액티브 노이즈 캔슬링. 최대 30시간 배터리.', price: 359000, image_url: '/images/products/product-3.jpg', category: '전자기기', stock: 100 },
        { name: 'LG 스탠바이미 27인치', description: '이동식 터치스크린 모니터. 내장 배터리.', price: 1090000, image_url: '/images/products/product-4.jpg', category: '전자기기', stock: 20 },
        { name: '나이키 에어맥스 97', description: '클래식한 디자인의 나이키 에어맥스 97.', price: 219000, image_url: '/images/products/product-5.jpg', category: '패션', stock: 80 },
        { name: '유니클로 히트텍 울트라 웜 세트', description: '겨울 필수템! 극세사 히트텍 상하의 세트.', price: 49900, image_url: '/images/products/product-6.jpg', category: '패션', stock: 200 },
        { name: '캉골 버킷햇 클래식', description: '영국 정통 캉골 버킷햇. 면 100%.', price: 69000, image_url: '/images/products/product-7.jpg', category: '패션', stock: 150 },
        { name: '노스페이스 눕시 패딩 자켓', description: '700 필파워 구스다운 충전재. 방수, 방풍 기능.', price: 399000, image_url: '/images/products/product-8.jpg', category: '패션', stock: 60 },
        { name: '곰곰 유기농 현미 10kg', description: '국내산 100% 유기농 현미. GAP 인증.', price: 42900, image_url: '/images/products/product-9.jpg', category: '식품', stock: 300 },
        { name: '정관장 홍삼정 에브리타임 30포', description: '6년근 홍삼 농축액 스틱. 하루 한 포.', price: 52000, image_url: '/images/products/product-10.jpg', category: '식품', stock: 500 },
        { name: '비비고 왕교자 만두 1.4kg', description: '두툼한 피에 꽉 찬 속. 국내산 돼지고기.', price: 12900, image_url: '/images/products/product-11.jpg', category: '식품', stock: 1000 },
        { name: '스타벅스 캡슐 커피 믹스 60개입', description: '네스프레소 호환 캡슐 3종 구성.', price: 34900, image_url: '/images/products/product-12.jpg', category: '식품', stock: 400 },
        { name: '다이슨 V15 무선 청소기', description: '레이저 먼지 감지 기술. 최대 60분 사용.', price: 1190000, image_url: '/images/products/product-13.jpg', category: '생활용품', stock: 25 },
        { name: '쿠쿠 IH 전기압력밥솥 10인용', description: 'IH 가열 방식으로 균일한 열 전달.', price: 289000, image_url: '/images/products/product-14.jpg', category: '생활용품', stock: 40 },
        { name: '코웨이 아이콘 정수기', description: '냉온정수 일체형. 직수형 필터 시스템.', price: 39900, image_url: '/images/products/product-15.jpg', category: '생활용품', stock: 100 },
        { name: '일룸 데스커 모션 데스크', description: '전동 높이 조절 스탠딩 데스크. 메모리 기능.', price: 699000, image_url: '/images/products/product-16.jpg', category: '생활용품', stock: 15 },
        { name: '설화수 자음생 크림 60ml', description: '한방 안티에이징 크림. 인삼 추출물.', price: 170000, image_url: '/images/products/product-17.jpg', category: '뷰티', stock: 70 },
        { name: '이니스프리 그린티 세럼 80ml', description: '제주 유기농 녹차에서 추출한 세럼.', price: 25000, image_url: '/images/products/product-18.jpg', category: '뷰티', stock: 300 },
        { name: '라네즈 립 슬리핑 마스크 20g', description: '밤사이 입술을 촉촉하게 케어. 베리 향.', price: 18000, image_url: '/images/products/product-19.jpg', category: '뷰티', stock: 500 },
        { name: '에스티로더 더블웨어 파운데이션', description: '24시간 지속력의 풀커버 파운데이션.', price: 64000, image_url: '/images/products/product-20.jpg', category: '뷰티', stock: 120 },
      ];
      for (const p of products) {
        await query('INSERT INTO products (name, description, price, image_url, category, stock) VALUES (?, ?, ?, ?, ?, ?)',
          [p.name, p.description, p.price, p.image_url, p.category, p.stock]);
      }
      console.log(`[Seed] 상품 ${products.length}개 생성 완료`);
    }
  } catch (err) {
    console.error('[Seed] 시드 실패:', err.message);
  }
}

async function startServer() {
  try {
    // 데이터베이스 초기화
    await initDatabase();

    // DB가 비어있으면 시드 데이터 자동 삽입
    await seedIfEmpty();

    // 서버 시작
    app.listen(PORT, () => {
      console.log('========================================');
      console.log(`  이커머스 API 서버 시작`);
      console.log(`  포트: ${PORT}`);
      console.log(`  DB: ${process.env.DB_TYPE || 'sqlite'}`);
      console.log(`  스토리지: ${process.env.STORAGE_TYPE || 'local'}`);
      console.log(`  리뷰 저장소: ${process.env.REVIEW_STORE || 'local'}`);
      console.log(`  캐시: ${process.env.CACHE_TYPE || 'memory'}`);
      console.log(`  큐: ${process.env.QUEUE_TYPE || 'sync'}`);
      console.log('========================================');
    });
  } catch (error) {
    console.error('[Server] 서버 시작 실패:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
