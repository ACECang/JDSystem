/**
 * 首次使用时的种子数据：仅包含个人资料库与常用网站收藏（岗位任务应由用户真实录入，不做预置）。
 * 通过 seedIfEmpty() 在应用启动时检测数据库是否为空，为空则写入一份示例数据，方便新用户快速上手。
 */

import { db } from '@/lib/db';

const SEED_INTERNSHIPS = [
  {
    company: '美团点评',
    role: '后端开发实习生',
    period: '2023.07 - 2023.12',
    description:
      '负责到店餐饮团队优惠券发放系统的重构，独立完成核心发放链路的接口设计与开发，将高并发场景下的发放耗时从 800ms 降低至 150ms；参与日均千万级请求的压测与调优，编写单元测试覆盖率提升至 85%。',
    highlights: ['Java', 'Spring Cloud', '高并发优化', '压测调优'],
  },
  {
    company: '字节跳动',
    role: '前端开发实习生',
    period: '2023.01 - 2023.06',
    description:
      '参与抖音电商中台管理后台的组件库建设，主导表单联动引擎的开发，覆盖公司内部 12 个业务线，减少重复表单代码约 40%；负责首屏加载性能优化，首屏时间从 2.1s 降低到 900ms。',
    highlights: ['React', 'TypeScript', '组件库', '性能优化'],
  },
];

const SEED_PROJECTS = [
  {
    name: '校园二手交易平台',
    role: '后端负责人 / 团队 Leader',
    period: '2022.09 - 2023.03',
    description:
      '面向校内师生的二手交易 App，负责后端架构设计与团队分工，采用微服务架构拆分用户、商品、订单、消息四大模块，支持超过 3000 名注册用户，日活跃用户峰值 400+；设计并落地基于 Redis 的分布式锁方案解决超卖问题。',
    techStack: ['Spring Boot', 'MySQL', 'Redis', 'RabbitMQ', 'Docker'],
    highlights: ['团队管理', '微服务架构', '分布式锁', '从0到1'],
  },
  {
    name: '智能简历匹配小工具',
    role: '全栈开发者',
    period: '2023.09 - 2023.11',
    description:
      '业余时间独立开发的求职辅助工具，支持解析 JD 文本并结合个人经历生成定制化简历要点，使用大模型 API 实现语义匹配打分；产品上线后累计服务同学超过 200 人次。',
    techStack: ['React', 'Node.js', 'OpenAI API', 'Vite'],
    highlights: ['独立开发', 'AI 应用', '产品思维'],
  },
];

const SEED_SKILLS: Array<{ name: string; category: string; level: 'basic' | 'proficient' | 'expert' }> = [
  { name: 'Java', category: '编程语言', level: 'proficient' },
  { name: 'JavaScript / TypeScript', category: '编程语言', level: 'proficient' },
  { name: 'Spring Cloud', category: '后端框架', level: 'proficient' },
  { name: 'React', category: '前端框架', level: 'expert' },
  { name: 'MySQL / Redis', category: '数据存储', level: 'proficient' },
  { name: '团队协作与沟通', category: '软技能', level: 'expert' },
  { name: '问题拆解与结构化表达', category: '软技能', level: 'proficient' },
];

const SEED_SITES = [
  { name: '拉勾网', url: 'https://www.lagou.com' },
  { name: 'BOSS直聘', url: 'https://www.zhipin.com' },
  { name: '牛客网', url: 'https://www.nowcoder.com' },
  { name: 'LeetCode', url: 'https://leetcode.cn' },
  { name: '脉脉', url: 'https://maimai.cn' },
];

const SEED_FLAG_KEY = 'jdsystem:seeded:v1';

/** 单次会话内的执行凭据。React StrictMode 下 effect 会被双调用，
 *  若不做去重，两次调用会并发读到「库为空」从而各插一份，导致种子数据重复。 */
let seedPromise: Promise<boolean> | null = null;

function isSeeded(): boolean {
  try {
    return localStorage.getItem(SEED_FLAG_KEY) === 'true';
  } catch {
    return false;
  }
}

function markSeeded(): void {
  try {
    localStorage.setItem(SEED_FLAG_KEY, 'true');
  } catch {
    // 标记失败不影响主流程
  }
}

async function runSeed(): Promise<boolean> {
  // 已种过则不再种：既避免重复，也避免用户主动清空资料库后被重新塞回示例数据
  if (isSeeded()) return false;

  const [library, sites] = await Promise.all([db.getExperienceLibrary(), db.getFavoriteSites()]);
  const isEmpty =
    library.internships.length === 0 && library.projects.length === 0 && library.skills.length === 0 && sites.length === 0;
  if (!isEmpty) {
    markSeeded();
    return false;
  }

  await Promise.all([
    ...SEED_INTERNSHIPS.map((item) => db.addInternship(item)),
    ...SEED_PROJECTS.map((item) => db.addProject(item)),
    ...SEED_SKILLS.map((item) => db.addSkill(item)),
    ...SEED_SITES.map((item) => db.addFavoriteSite(item)),
  ]);

  markSeeded();
  return true;
}

/** 仅在首次使用时写入种子数据（经历库与网站收藏均为空）；同一会话内保证只执行一次 */
export function seedIfEmpty(): Promise<boolean> {
  if (!seedPromise) seedPromise = runSeed();
  return seedPromise;
}
