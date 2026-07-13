import {
  Globe,
  Building2,
  GraduationCap,
  Car,
  CreditCard,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface Product {
  name: string;
  description: string;
  icon: LucideIcon;
  href: string;
}

export const products: Product[] = [
  {
    name: 'TradeGPT',
    description:
      'AI驱动的外贸客户管理系统，智能跟进、邮件自动化、客户画像分析，让外贸团队效率翻倍',
    icon: Globe,
    href: '#',
  },
  {
    name: '装企管家',
    description:
      '装修行业一站式数字化管理平台，覆盖量房、报价、施工进度、客户跟进全流程',
    icon: Building2,
    href: '#',
  },
  {
    name: 'AI高考志愿填报系统',
    description:
      '基于大数据分析的智能高考志愿填报工具，精准匹配院校与专业，辅助考生科学决策',
    icon: GraduationCap,
    href: '#',
  },
  {
    name: '毛驴拼车',
    description: '便捷的城际拼车出行小程序，智能匹配行程，让顺风出行更简单',
    icon: Car,
    href: '#',
  },
  {
    name: '会员管理SaaS',
    description:
      '轻量级会员管理系统，支持积分、储值、优惠券、会员等级，适合零售/餐饮/服务业',
    icon: CreditCard,
    href: '#',
  },
];
