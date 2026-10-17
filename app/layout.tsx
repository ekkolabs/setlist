import type { Metadata, Viewport } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { siteConfig } from '@/site.config';
import './globals.css';

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

const { fonts } = siteConfig;
const fontVars = {
  '--font-ui': fonts.ui,
  '--font-sheet': fonts.sheet,
  '--font-numbers': fonts.numbers,
} as CSSProperties;
const themeKey = JSON.stringify(`${siteConfig.id}-theme`);

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={fontVars}>
      <head>
        {/* Apply the saved theme before first paint so dark mode doesn't flash white. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `try{if(localStorage.getItem(${themeKey})==='dark')document.documentElement.dataset.theme='dark'}catch(e){}`,
          }}
        />
        {fonts.stylesheet?.startsWith('https://fonts.googleapis.com') && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          </>
        )}
        {fonts.stylesheet && <link href={fonts.stylesheet} rel="stylesheet" />}
      </head>
      <body>
        <div className="app-root" style={{ minHeight: '100vh' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
