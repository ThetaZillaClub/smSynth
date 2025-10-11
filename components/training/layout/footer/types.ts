// components/training/layout/footer/types.ts
export type FooterAction = {
  label?: string; // text is now optional if we render an icon
  icon?: React.ReactNode; // NEW
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  title?: string;
};
