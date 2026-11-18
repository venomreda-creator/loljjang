import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'loljjang — 챔피언 연습 기록',
  description:
    '최대 10개 계정의 전적을 합산해 연습 챔피언의 판수와 승률을 한 화면에서 확인합니다.',
};

const themeScript = `try{const t=localStorage.getItem('loljjang:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
