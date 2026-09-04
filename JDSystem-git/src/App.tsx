import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from '@/vendor/mtd-react3';
import { navItems } from './nav-items';
import '@/vendor/mtd-react3/style.css';
import './App.css';
import './styles/tokens.css';

const queryClient = new QueryClient();

const App = () => (
  <ConfigProvider>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          {navItems.map(({ to, page }) => (
            <Route key={to} path={to} element={page} />
          ))}
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  </ConfigProvider>
);

export default App;
