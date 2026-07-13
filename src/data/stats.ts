export interface Stat {
  value: string;
  numericValue: number;
  suffix: string;
  label: string;
}

export const stats: Stat[] = [
  { value: '10+', numericValue: 10, suffix: '+', label: '已服务企业' },
  { value: '5+', numericValue: 5, suffix: '+', label: '核心产品' },
  { value: '99.9%', numericValue: 99.9, suffix: '%', label: '系统可用率' },
  { value: '7×24', numericValue: 7, suffix: '×24', label: '技术支持' },
];
