import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import PRForm from './components/PRForm';
import PRHistory from './components/PRHistory';
import PRDetail from './components/PRDetail';
import Settings from './components/Settings';
import RuleSets from './components/RuleSets';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<PRForm />} />
        <Route path="/history" element={<PRHistory />} />
        <Route path="/review/:id" element={<PRDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/rules" element={<RuleSets />} />
      </Routes>
    </Layout>
  );
}

export default App;
