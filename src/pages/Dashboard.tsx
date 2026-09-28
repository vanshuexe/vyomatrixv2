import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatedSection } from '../components/ui/AnimatedSection';
import { BookOpen, Clock, CheckCircle2, AlertCircle, LogOut, ExternalLink, IndianRupee } from 'lucide-react';
import { SEO } from '../components/SEO';

export function Dashboard() {
  const [data, setData] = useState<{ email: string; orders: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDashboard = async () => {
      const token = localStorage.getItem('user_token');
      if (!token) {
        navigate('/login');
        return;
      }

      try {
        const res = await fetch('/api/user/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else {
          // Token might be invalid or expired
          localStorage.removeItem('user_token');
          localStorage.removeItem('user_email');
          window.dispatchEvent(new Event('auth_change'));
          navigate('/login');
        }
      } catch (err) {
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('user_token');
    localStorage.removeItem('user_email');
    window.dispatchEvent(new Event('auth_change'));
    navigate('/');
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-[calc(100vh-80px)] flex items-center justify-center bg-silver-light">
        <div className="text-ink/60 font-medium animate-pulse">Loading your dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 min-h-[calc(100vh-80px)] p-8 bg-silver-light">
        <div className="max-w-3xl mx-auto bg-red-50 text-red-600 p-6 rounded-sm border border-red-200">
          <AlertCircle className="mb-2" />
          <h2 className="font-bold">Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const STATUS_CONFIG: Record<string, { label: string; classes: string; icon: any }> = {
    'Payment Verified': { label: 'Payment Verified', classes: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle2 },
    'Pending':          { label: 'Pending',          classes: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Clock },
    'Simulated / Test': { label: 'Simulated / Test', classes: 'bg-orange-100 text-orange-800 border-orange-200', icon: AlertCircle },
    'Reviewed':         { label: 'Reviewed',         classes: 'bg-blue-100 text-blue-800 border-blue-200', icon: CheckCircle2 },
    'Cancelled':        { label: 'Cancelled',        classes: 'bg-red-100 text-red-800 border-red-200', icon: AlertCircle },
    'Refunded':         { label: 'Refunded',         classes: 'bg-purple-100 text-purple-800 border-purple-200', icon: CheckCircle2 },
  };

  return (
    <div className="flex-1 bg-silver-light min-h-[calc(100vh-80px)] pb-20">
      <SEO title="My Dashboard" description="Manage your Vyomatrix Academy enrollments." />
      
      {/* Dashboard Header */}
      <div className="bg-ink text-white py-12 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold font-heading mb-2">My Dashboard</h1>
            <p className="text-silver flex items-center gap-2">
              Signed in as <span className="text-white font-medium">{data?.email}</span>
            </p>
          </div>
          <button 
            onClick={handleLogout}
            className="px-4 py-2 border border-white/20 rounded-sm text-sm font-medium hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 mt-8">
        <AnimatedSection>
          <div className="mb-6">
            <h2 className="text-xl font-bold font-heading text-ink flex items-center gap-2">
              <BookOpen className="text-primary" /> My Courses & Enrollments
            </h2>
          </div>

          {data?.orders.length === 0 ? (
            <div className="bg-white border border-silver/30 rounded-sm p-16 text-center shadow-sm">
              <div className="w-16 h-16 bg-silver-light rounded-full flex items-center justify-center mx-auto mb-4 text-silver">
                <BookOpen size={24} />
              </div>
              <h3 className="text-lg font-bold text-ink mb-2">No enrollments yet</h3>
              <p className="text-silver mb-6">You haven't enrolled in any Academy courses yet.</p>
              <button 
                onClick={() => navigate('/academy')}
                className="px-6 py-2.5 bg-primary text-white font-bold rounded-sm hover:bg-primary-dark transition-colors inline-flex items-center gap-2"
              >
                Browse Academy <ExternalLink size={16} />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {data?.orders.map((order, i) => {
                const d = order.details || {};
                const isRealPayment = order.paymentId && order.paymentId !== 'simulated';
                const defaultStatus = isRealPayment ? 'Payment Verified' : 'Simulated / Test';
                const currentStatus = order.adminStatus || defaultStatus;
                
                const statusCfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG['Pending'];
                const StatusIcon = statusCfg.icon;

                // Resolve amount
                let displayAmount = '—';
                if (d.price) displayAmount = d.price;
                else if (d.amountINR) displayAmount = `₹${Number(d.amountINR).toLocaleString('en-IN')}`;
                else if (d.amount && d.amount > 1000) displayAmount = `₹${(d.amount / 100).toLocaleString('en-IN')}`;
                
                return (
                  <div key={order.id || i} className="bg-white border border-silver/20 rounded-sm shadow-sm overflow-hidden flex flex-col md:flex-row">
                    {/* Status Strip */}
                    <div className={`w-2 md:w-3 flex-shrink-0 ${statusCfg.classes.split(' ')[0]}`}></div>
                    
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div>
                            <h3 className="text-lg font-bold text-ink">{d.programTitle || d.programId || 'Academy Course'}</h3>
                            {d.track && (
                              <span className="inline-block mt-2 px-2.5 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full">
                                {d.track} Track
                              </span>
                            )}
                          </div>
                          <div className={`px-3 py-1.5 border rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap ${statusCfg.classes}`}>
                            <StatusIcon size={14} /> {statusCfg.label}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                          <div>
                            <div className="text-[10px] uppercase font-bold text-silver mb-1">Order ID</div>
                            <div className="font-mono text-xs text-ink/80 truncate">{order.orderId !== 'simulated' ? order.orderId : 'Simulated'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase font-bold text-silver mb-1">Payment ID</div>
                            <div className="font-mono text-xs text-ink/80 truncate">{isRealPayment ? order.paymentId : 'Simulated'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase font-bold text-silver mb-1">Amount</div>
                            <div className="font-medium text-sm text-ink flex items-center gap-1">
                              {displayAmount.startsWith('₹') ? '' : <IndianRupee size={12} className="text-silver" />}
                              {displayAmount}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase font-bold text-silver mb-1">Date</div>
                            <div className="font-medium text-sm text-ink truncate">
                              {order.date ? new Date(order.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AnimatedSection>
      </div>
    </div>
  );
}
