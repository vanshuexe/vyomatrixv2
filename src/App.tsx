/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Academy } from './pages/Academy';
import { Checkout } from './pages/Checkout';
import { Media } from './pages/Media';
import { Contact } from './pages/Contact';
import { Admin } from './pages/Admin';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';

export default function App() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="academy" element={<Academy />} />
            <Route path="academy/checkout/:id" element={<Checkout />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="media" element={<Media />} />
            <Route path="media/:slug" element={<Media />} /> {/* Placeholder for individual articles */}
            <Route path="contact" element={<Contact />} />
            <Route path="login" element={<Login />} />
            <Route path="dashboard" element={<Dashboard />} />
          </Route>
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </BrowserRouter>
    </HelmetProvider>
  );
}
