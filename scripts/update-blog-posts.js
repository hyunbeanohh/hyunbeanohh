/**
 * ODDN-Blog (content/blog/) 에서 최신 포스트 5개를 읽어
 * 프로필 README.md의 BLOG-POST-LIST 마커 사이에 업데이트하는 스크립트
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const BLOG_REPO = 'hyunbeanohh/ODDN-Blog';
const BLOG_CONTENT_PATH = 'content/blog';
const BLOG_BASE_URL = 'https://oddn.ai.kr';
const README_PATH = path.join(__dirname, '..', 'README.md');
const MAX_POSTS = 5;

function githubRequest(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'hyunbeanohh-profile-updater',
        Accept: 'application/vnd.github.v3+json',
      },
    };

    https
      .get(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub API error ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}\nBody: ${data}`));
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * MDX/MD 파일에서 YAML frontmatter를 파싱합니다.
 * tags 필드처럼 배열 형태는 단순히 문자열로 보존합니다.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const frontmatter = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line
      .slice(colonIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');

    if (key) frontmatter[key] = value;
  }

  return frontmatter;
}

async function getLatestPosts() {
  console.log(`Fetching blog directory from ${BLOG_REPO}/${BLOG_CONTENT_PATH}...`);

  const blogDir = await githubRequest(
    `https://api.github.com/repos/${BLOG_REPO}/contents/${BLOG_CONTENT_PATH}`
  );

  if (!Array.isArray(blogDir)) {
    throw new Error('Unexpected response from GitHub API: ' + JSON.stringify(blogDir));
  }

  const folders = blogDir.filter((item) => item.type === 'dir');
  console.log(`Found ${folders.length} blog post folders`);

  const posts = [];

  for (const folder of folders) {
    try {
      const dirContents = await githubRequest(folder.url);

      // .mdx 우선, 없으면 .md
      const mdxFile =
        dirContents.find((f) => f.name.endsWith('.mdx')) ||
        dirContents.find((f) => f.name.endsWith('.md'));

      if (!mdxFile) {
        console.warn(`  [skip] ${folder.name}: No MDX/MD file found`);
        continue;
      }

      const fileData = await githubRequest(mdxFile.url);
      const rawContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
      const fm = parseFrontmatter(rawContent);

      if (!fm.title || !fm.date) {
        console.warn(`  [skip] ${folder.name}: Missing title or date in frontmatter`);
        continue;
      }

      // slug는 폴더명 기준 (gatsby-node.js의 페이지 생성 방식과 동일하게 맞춤)
      const slug = folder.name;
      const postUrl = `${BLOG_BASE_URL}/${slug}`;

      posts.push({
        title: fm.title,
        date: fm.date,
        description: fm.description || '',
        slug,
        url: postUrl,
      });

      console.log(`  [ok] ${fm.title} (${fm.date})`);
    } catch (err) {
      console.warn(`  [error] ${folder.name}: ${err.message}`);
    }
  }

  // 날짜 내림차순 정렬 (최신 글이 맨 위)
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  return posts.slice(0, MAX_POSTS);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function updateReadme(posts) {
  if (!fs.existsSync(README_PATH)) {
    throw new Error(`README.md not found at ${README_PATH}`);
  }

  let readme = fs.readFileSync(README_PATH, 'utf-8');

  const startMarker = '<!-- BLOG-POST-LIST:START -->';
  const endMarker = '<!-- BLOG-POST-LIST:END -->';

  if (!readme.includes(startMarker) || !readme.includes(endMarker)) {
    throw new Error('BLOG-POST-LIST markers not found in README.md');
  }

  const postLines = posts.map((post) => {
    return `- [${post.title}](${post.url}) <sub>${formatDate(post.date)}</sub>`;
  });

  const newSection = `${startMarker}\n${postLines.join('\n')}\n${endMarker}`;

  const updated = readme.replace(
    new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`),
    newSection
  );

  fs.writeFileSync(README_PATH, updated, 'utf-8');
  console.log(`\nREADME.md updated with ${posts.length} posts:`);
  posts.forEach((p, i) => console.log(`  ${i + 1}. ${p.title} — ${p.date}`));
}

async function main() {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }

  const posts = await getLatestPosts();

  if (posts.length === 0) {
    console.log('No posts found. README not updated.');
    return;
  }

  updateReadme(posts);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
