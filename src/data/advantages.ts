import { Brain, Rocket, Puzzle, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface Advantage {
  title: string;
  description: string;
  icon: LucideIcon;
}

export const advantages: Advantage[] = [
  {
    title: 'AI原生架构',
    description: '深度集成大语言模型，让每个系统都具备智能决策能力',
    icon: Brain,
  },
  {
    title: '快速交付',
    description: '成熟的开发框架和组件库，项目周期缩短50%',
    icon: Rocket,
  },
  {
    title: '灵活定制',
    description: '模块化设计，按需定制，随业务增长平滑扩展',
    icon: Puzzle,
  },
  {
    title: '持续运维',
    description: '提供长期技术支持和迭代升级服务，保障系统稳定运行',
    icon: Shield,
  },
];
