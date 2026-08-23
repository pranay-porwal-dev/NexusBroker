import { createContext, useContext, useState, useEffect } from 'react';

const THEMES = {
  dark: {
    bg:           '#0f0f10',
    bgCard:       '#1a1a1b',
    bgInput:      '#242425',
    border:       '#2d2d2e',
    borderHover:  '#3d3d3e',
    textPrimary:  '#ffffff',
    textSecondary:'#9b9b9b',
    textMuted:    '#5a5a5a',
    green:        '#00b386',   
    greenBg:      '#00b38612',
    greenBorder:  '#00b38630',
    red:          '#eb5757',  
    redBg:        '#eb575712',
    redBorder:    '#eb575730',
    blue:         '#1d6ce5',   
    blueBg:       '#1d6ce512',
    yellow:       '#f4b942',
    nav:          '#111112',
    navBorder:    '#1f1f20',
  },
  light: {
    bg:           '#f8f8f8',
    bgCard:       '#ffffff',
    bgInput:      '#f2f2f2',
    border:       '#e8e8e8',
    borderHover:  '#d0d0d0',
    textPrimary:  '#1a1a1a',
    textSecondary:'#666666',
    textMuted:    '#aaaaaa',
    green:        '#00b386',
    greenBg:      '#00b38610',
    greenBorder:  '#00b38625',
    red:          '#eb5757',
    redBg:        '#eb575710',
    redBorder:    '#eb575725',
    blue:         '#1d6ce5',
    blueBg:       '#1d6ce510',
    yellow:       '#f4b942',
    nav:          '#ffffff',
    navBorder:    '#e8e8e8',
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    return localStorage.getItem('nexus-theme') || 'dark';
  });

  const theme = THEMES[mode];

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('nexus-theme', 'dark');
  }, []);

  const toggleTheme = () => setMode(m => m === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);