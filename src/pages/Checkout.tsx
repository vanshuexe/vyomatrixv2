import React, { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { AnimatedSection } from '../components/ui/AnimatedSection';
import { SEO } from '../components/SEO';
import { ShieldCheck, CheckCircle2, ArrowLeft, Loader2, CreditCard, Lock, Mail, User, Phone, MapPin, GraduationCap, Banknote, Calendar, Building, Tag, Globe } from 'lucide-react';
import { Button } from '../components/ui/Button';

// Razorpay type definition for TypeScript
declare global {
  interface Window {
    Razorpay: any;
  }
}

export function Checkout() {
  const { id } = useParams();
  const location = useLocation();
  const [academyPrograms, setAcademyPrograms] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('user_token');
    const storedEmail = localStorage.getItem('user_email');
    if (token && storedEmail) {
      setUser({ email: storedEmail });
      setFormData(prev => ({...prev, email: storedEmail}));
      setStep('details');
    }

    fetch('/api/cms/data')
      .then(res => res.json())
      .then(data => {
        if (data && data.courses) {
          setAcademyPrograms(data.courses);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, []);

  const searchParams = new URLSearchParams(location.search);
  const programId = id || searchParams.get('program');

  // Fallback to first program if not found, just so we don't white screen
  const program = academyPrograms.find(p => p.id === programId) || (academyPrograms.length > 0 ? academyPrograms[0] : null);
  
  const [step, setStep] = useState<'auth' | 'details' | 'payment' | 'success'>('auth');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  
  const [user, setUser] = useState<any>(null);
  const [authMode, setAuthMode] = useState<'login'|'signup'>('signup');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', city: '', track: 'Business track', organization: '', coupon: '', gateway: 'razorpay'
  });

  useEffect(() => {
    const savedDetails = sessionStorage.getItem('vyomatrix_checkout_details');
    if (savedDetails) {
      try {
        setFormData(prev => ({ ...prev, ...JSON.parse(savedDetails) }));
        sessionStorage.removeItem('vyomatrix_checkout_details');
      } catch (err) {
        console.error('Failed to restore registration details', err);
      }
    }
  }, []);

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError('');
    
    try {
      const res = await fetch('/api/user/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      const data = await res.json();
      
      if (res.ok) {
        localStorage.setItem('user_token', data.token);
        localStorage.setItem('user_email', data.user.email);
        window.dispatchEvent(new Event('auth_change'));
        
        setUser(data.user);
        setFormData(prev => ({...prev, email: data.user.email || ''}));
        setStep('details');
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setAuthError('Connection error during authentication.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('payment');
  };

  const handlePayment = async () => {
    setIsProcessing(true);
    
    try {
      // Clean numeric amount from the price string (e.g. "INR 45,000" -> 45000)
      const numericPrice = program.price.replace(/[^0-9]/g, '');
      const amount = parseInt(numericPrice, 10);

      // Enrich formData with course context
      const enrichedDetails = {
        ...formData,
        programId: program.id,
        programTitle: program.title,
        amountINR: amount,
        price: program.price,
      };

      // 1. Create order on backend
      const orderRes = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, programId: program.id, studentDetails: formData })
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.orderId) {
        throw new Error(orderData.error || 'Razorpay could not create a payment order.');
      }

      // 2. Load razorpay script
      const res = await loadRazorpayScript();
      if (!res) {
        alert('Razorpay SDK failed to load. Are you online?');
        setIsProcessing(false);
        return;
      }

      // 3. Initialize Razorpay Checkout
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || '', // Will be injected when building
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Vyomatrix Academy',
        description: `Enrolment: ${program.title}`,
        order_id: orderData.orderId,
        handler: async function (response: any) {
          // 4. Verify signature on backend
          try {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                details: enrichedDetails
              })
            });
            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              setPaymentReference(verifyData.paymentId || response.razorpay_payment_id);
              setStep('success');
            } else {
              alert(verifyData.message || 'Payment verification failed.');
            }
          } catch (e) {
            console.error(e);
            alert('Error verifying payment.');
          }
        },
        prefill: {
          name: formData.name,
          email: formData.email,
          contact: formData.phone
        },
        notes: {
          address: formData.city,
          track: formData.track
        },
        theme: {
          color: '#5B4AF0'
        }
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.on('payment.failed', function (response: any) {
        alert(response.error.description);
      });
      paymentObject.open();
    } catch (e) {
      console.error(e);
      alert('An error occurred during checkout setup.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) return <div className="p-24 text-center">Loading secure checkout...</div>;
  if (!program) return <div className="p-24 text-center">Program not found.</div>;

  if (step === 'success') {
     return (
       <div className="w-full bg-silver-light min-h-[calc(100vh-80px)] py-24 flex flex-col items-center justify-center px-6">
         <AnimatedSection className="bg-white p-10 md:p-16 rounded-sm shadow-xl border border-silver/20 max-w-2xl w-full text-center relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-2 bg-green-500"></div>
           <div className="w-24 h-24 bg-green-500/10 border-4 border-green-500 text-green-500 rounded-full flex items-center justify-center shadow-lg mb-8 mx-auto">
             <CheckCircle2 size={48} strokeWidth={2.5} />
           </div>
           <h2 className="text-3xl font-bold text-ink mb-4 font-heading">Enrolment Successful</h2>
           <p className="text-lg text-ink/80 mb-8 max-w-md mx-auto">
             Welcome to Vyomatrix Academy! Your seat in the <strong>{program.title}</strong> is confirmed.
           </p>
           
           <div className="bg-silver-light/50 border border-silver/20 rounded-sm p-8 mb-10 text-left">
             <h3 className="font-bold text-ink mb-6 text-lg border-b border-silver/20 pb-4">Your Next Steps</h3>
             
             <div className="space-y-8">
               <div className="flex items-start gap-4 relative">
                 <div className="absolute left-6 top-10 w-0.5 h-12 bg-silver/30"></div>
                 <div className="w-12 h-12 bg-white border border-silver/30 rounded-full flex items-center justify-center shadow-sm flex-shrink-0 z-10">
                   <Mail className="text-primary" size={20} />
                 </div>
                 <div>
                   <h4 className="font-bold text-ink mb-1">1. Check your inbox</h4>
                   <p className="text-sm text-ink/70">
                     Razorpay has processed your payment. Your payment receipt will be sent to <strong>{formData.email || 'your email'}</strong> by the gateway.
                   </p>
                   {paymentReference && <p className="text-xs text-ink/60 mt-2">Payment ID: <strong>{paymentReference}</strong></p>}
                 </div>
               </div>

               <div className="flex items-start gap-4 relative">
                 <div className="absolute left-6 top-10 w-0.5 h-12 bg-silver/30"></div>
                 <div className="w-12 h-12 bg-white border border-silver/30 rounded-full flex items-center justify-center shadow-sm flex-shrink-0 z-10">
                   <User className="text-primary" size={20} />
                 </div>
                 <div>
                   <h4 className="font-bold text-ink mb-1">2. Complete your profile</h4>
                   <p className="text-sm text-ink/70">
                     Follow the link in your email to set up your student dashboard and access pre-reading materials.
                   </p>
                 </div>
               </div>

               <div className="flex items-start gap-4">
                 <div className="w-12 h-12 bg-white border border-silver/30 rounded-full flex items-center justify-center shadow-sm flex-shrink-0 z-10">
                   <Calendar className="text-primary" size={20} />
                 </div>
                 <div>
                   <h4 className="font-bold text-ink mb-1">3. Join the live orientation</h4>
                   <p className="text-sm text-ink/70">
                     Your cohort schedule and calendar invites will be available in your dashboard 48 hours before start.
                   </p>
                 </div>
               </div>
             </div>
           </div>

           <Button to="/academy" variant="primary" className="px-8 shadow-md">
             Return to Academy
           </Button>
         </AnimatedSection>
       </div>
     );
  }

  return (
    <div className="w-full bg-silver-light min-h-[calc(100vh-80px)] py-12 md:py-24 relative overflow-hidden">
      <SEO 
        title={`Checkout: ${program.title}`} 
        description="Secure checkout for Vyomatrix Academy." 
      />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[80px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
      
      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <Link to="/academy" className="inline-flex items-center gap-2 text-sm font-medium text-ink/60 hover:text-primary mb-8 transition-colors">
          <ArrowLeft size={16} /> Back to Programs
        </Link>
        
        <div className="flex flex-col md:flex-row gap-8 lg:gap-12">
          {/* Left Column: Form / Payment */}
          <div className="flex-1">
            {step === 'auth' && (
              <AnimatedSection>
                <div className="bg-white border border-silver/20 rounded-sm shadow-md p-6 md:p-10 relative overflow-hidden text-center">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
                  <Lock className="text-primary w-12 h-12 mx-auto mb-4" />
                  <h2 className="text-3xl font-bold text-ink mb-2 font-heading">
                    {authMode === 'signup' ? 'Create an Account' : 'Welcome Back'}
                  </h2>
                  <p className="text-ink/60 mb-8 pb-6 border-b border-silver/10 text-sm">
                    {authMode === 'signup' 
                      ? 'Please sign up to proceed with enrolment and track your courses.' 
                      : 'Log in to continue your enrolment securely.'}
                  </p>
                  
                  <form onSubmit={handleAuth} className="space-y-4 max-w-sm mx-auto text-left">
                    <div>
                      <label className="block text-sm font-bold text-ink mb-1">Email</label>
                      <input 
                        type="email" 
                        required 
                        value={authEmail} 
                        onChange={e => setAuthEmail(e.target.value)}
                        className="w-full px-4 py-3 bg-silver-light/20 border border-silver/30 rounded-sm focus:outline-none focus:border-primary shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-ink mb-1">Password</label>
                      <input 
                        type="password" 
                        required 
                        value={authPassword} 
                        onChange={e => setAuthPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-silver-light/20 border border-silver/30 rounded-sm focus:outline-none focus:border-primary shadow-inner"
                      />
                    </div>
                    {authError && <p className="text-red-500 text-xs font-bold">{authError}</p>}
                    
                    <button 
                      type="submit" 
                      disabled={isAuthLoading}
                      className="w-full py-3 bg-primary text-white rounded-sm font-bold hover:bg-primary-dark transition-colors mt-4 disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                      {isAuthLoading ? <Loader2 className="animate-spin" size={18} /> : null}
                      {authMode === 'signup' ? 'Create Account' : 'Secure Login'}
                    </button>
                    
                    <div className="text-center mt-4 pt-4 border-t border-silver/10">
                      <button 
                        type="button" 
                        onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setAuthError(''); }} 
                        className="text-sm font-bold text-ink/60 hover:text-primary transition-colors"
                      >
                        {authMode === 'signup' ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
                      </button>
                    </div>
                  </form>
                </div>
              </AnimatedSection>
            )}
            
            {step === 'details' && (
              <AnimatedSection>
                <div className="bg-white border border-silver/20 rounded-sm shadow-md p-6 md:p-10 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
                  <h2 className="text-3xl font-bold text-ink mb-2 font-heading">Enrolment Details</h2>
                  <p className="text-ink/60 mb-8 pb-6 border-b border-silver/10 text-sm">Please fill out your details. This information will be used for your official tax invoice and academy certificate.</p>
                  
                  <form onSubmit={handleDetailsSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-bold text-ink mb-2 flex items-center gap-2"><User size={16} className="text-primary" /> Full name *</label>
                        <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 bg-silver-light/20 border border-silver/30 rounded-sm text-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:bg-white transition-colors shadow-inner" placeholder="John Doe" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-ink mb-2 flex items-center gap-2"><Mail size={16} className="text-primary" /> Email address *</label>
                        <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-3 bg-silver-light/20 border border-silver/30 rounded-sm text-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:bg-white transition-colors shadow-inner" placeholder="john@example.com" />
                      </div>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-bold text-ink mb-2 flex items-center gap-2"><Phone size={16} className="text-primary" /> Phone number *</label>
                        <input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-3 bg-silver-light/20 border border-silver/30 rounded-sm text-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:bg-white transition-colors shadow-inner" placeholder="+91 98765 43210" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-ink mb-2 flex items-center gap-2"><MapPin size={16} className="text-primary" /> City *</label>
                        <input required type="text" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full px-4 py-3 bg-silver-light/20 border border-silver/30 rounded-sm text-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:bg-white transition-colors shadow-inner" placeholder="e.g. Bangalore" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-ink mb-2 flex items-center gap-2"><Building size={16} className="text-primary" /> College or Employer (Optional)</label>
                      <input type="text" value={formData.organization} onChange={e => setFormData({...formData, organization: e.target.value})} className="w-full px-4 py-3 bg-silver-light/20 border border-silver/30 rounded-sm text-base focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:bg-white transition-colors shadow-inner" placeholder="Organization name" />
                    </div>

                    <div className="pt-4 border-t border-silver/10">
                      <label className="block text-sm font-bold text-ink mb-3 flex items-center gap-2"><GraduationCap size={16} className="text-primary" /> Track preference *</label>
                      <div className="grid sm:grid-cols-2 gap-4">
                        {program.tracks.map((track: string) => (
                          <label key={track} className={`flex items-center gap-3 p-4 border rounded-sm cursor-pointer transition-all ${formData.track === track ? 'border-primary bg-primary/5 text-primary font-bold shadow-sm' : 'border-silver/30 hover:border-primary/50 text-ink/80 hover:bg-silver-light/50'}`}>
                            <input 
                              type="radio" 
                              name="track" 
                              value={track} 
                              checked={formData.track === track}
                              onChange={e => setFormData({...formData, track: e.target.value})}
                              className="w-4 h-4 text-primary border-silver/30 focus:ring-primary"
                            />
                            <span className="text-sm">{track}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6 mt-6 border-t border-silver/10">
                      <button type="submit" className="w-full py-4 bg-primary text-white rounded-sm font-bold hover:bg-primary-dark transition-colors shadow-xl shadow-primary/20 flex items-center justify-center gap-2 text-lg">
                        Continue to Payment <ArrowLeft size={18} className="rotate-180" />
                      </button>
                    </div>
                  </form>
                </div>
              </AnimatedSection>
            )}

            {step === 'payment' && (
              <AnimatedSection>
                <div className="bg-white border border-silver/20 rounded-sm shadow-md p-6 md:p-10 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
                  <h2 className="text-3xl font-bold text-ink mb-2 font-heading flex items-center gap-3">
                    Secure Checkout
                  </h2>
                  <p className="text-ink/60 mb-8 pb-6 border-b border-silver/10 text-sm">Review your order summary, then continue securely with Razorpay using cards, UPI, net banking, or wallets.</p>
                  
                  <div className="mb-8 border border-silver/20 rounded-sm p-6 bg-silver-light/20">
                    <h3 className="text-sm font-bold text-ink mb-2 flex items-center gap-2"><Globe size={16} className="text-primary"/> Razorpay Secure Payment</h3>
                    <p className="text-sm text-ink/70">Cards, UPI, net banking, and wallets are available in the Razorpay payment window.</p>
                  </div>

                  <div className="bg-silver-light/20 border border-silver/20 rounded-sm p-10 mb-8 text-center shadow-inner">
                    <Lock className="mx-auto text-primary mb-4" size={48} strokeWidth={1.5} />
                    <h3 className="font-bold text-ink mb-3 text-xl">Pay securely with Razorpay</h3>
                    <p className="text-sm text-ink/70 max-w-sm mx-auto mb-8 leading-relaxed">
                      Razorpay will open its secure payment window to complete your INR transaction. We do not store your card details.
                    </p>
                    <button 
                      onClick={handlePayment}
                      disabled={isProcessing}
                      className="w-full md:w-auto px-12 py-4 bg-ink text-white rounded-sm font-bold hover:bg-ink/80 transition-colors disabled:opacity-70 flex items-center justify-center gap-3 mx-auto text-lg shadow-xl"
                    >
                      {isProcessing ? <><Loader2 size={20} className="animate-spin" /> Preparing Checkout...</> : <><CreditCard size={20} /> Pay {program.price}</>}
                    </button>
                    <div className="flex items-center justify-center gap-2 mt-6 text-xs text-ink/60 font-medium">
                      <ShieldCheck size={16} className="text-primary" /> 256-bit SSL Encrypted Transaction
                    </div>
                  </div>
                  <div className="text-center">
                    <button onClick={() => setStep('details')} className="text-sm font-bold text-ink/60 hover:text-primary transition-colors flex items-center justify-center gap-2 mx-auto">
                      <ArrowLeft size={16} /> Edit student details
                    </button>
                  </div>
                </div>
              </AnimatedSection>
            )}
          </div>

          {/* Right Column: Order Summary */}
          <div className="w-full md:w-80 lg:w-96">
            <AnimatedSection delay={0.1}>
              <div className="bg-white border border-silver/20 rounded-sm shadow-md p-8 sticky top-28">
                <h3 className="font-bold text-ink mb-6 font-heading border-b border-silver/10 pb-4 text-xl flex items-center gap-2">
                  <Banknote size={20} className="text-primary" /> Order Summary
                </h3>
                <div className="pb-6 mb-6 border-b border-silver/10 space-y-5">
                  <div className="font-bold text-ink text-xl leading-tight font-heading">{program.title}</div>
                  
                  <div className="flex items-start gap-3">
                    <Calendar size={18} className="text-primary mt-0.5" />
                    <div>
                      <div className="text-xs text-ink/50 uppercase tracking-wider font-mono mb-1 font-bold">Cohort</div>
                      <div className="text-sm font-medium text-ink">{program.date}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <GraduationCap size={18} className="text-primary mt-0.5" />
                    <div>
                      <div className="text-xs text-ink/50 uppercase tracking-wider font-mono mb-1 font-bold">Selected Track</div>
                      <div className="text-sm font-medium text-ink">{formData.track || 'Pending Selection'}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-silver-light/30 border border-silver/10 rounded-sm p-5 mb-6">
                  <h4 className="text-xs font-bold text-ink uppercase tracking-wider mb-4 border-b border-silver/10 pb-2">What's Included</h4>
                  <ul className="space-y-3">
                    {program.highlights.slice(0, 3).map((highlight, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm text-ink/80 leading-snug">
                        <CheckCircle2 size={16} className="text-primary flex-shrink-0 mt-0.5" />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div className="mb-6">
                  <label className="block text-xs font-bold text-ink mb-2 uppercase tracking-wider flex items-center gap-2"><Tag size={12} className="text-primary" /> Coupon Code</label>
                  <div className="flex gap-2">
                    <input type="text" value={formData.coupon} onChange={e => setFormData({...formData, coupon: e.target.value})} className="flex-1 px-3 py-2 bg-silver-light/20 border border-silver/30 rounded-sm text-sm focus:outline-none focus:border-primary focus:bg-white" placeholder="Optional" />
                    <button className="px-4 py-2 bg-silver-light text-ink text-sm font-bold rounded-sm border border-silver/30 hover:bg-silver/10 transition-colors">Apply</button>
                  </div>
                </div>

                <div className="py-5 flex items-center justify-between font-bold text-2xl text-ink border-t border-silver/20">
                  <span>Total</span>
                  <span className="text-right">
                    {program.originalPrice && (
                      <span className="block text-xs text-silver line-through">{program.originalPrice}</span>
                    )}
                    <span className="block text-primary">{program.price}</span>
                    {program.offerLabel && (
                      <span className="block text-xs font-semibold text-primary/80">{program.offerLabel}</span>
                    )}
                  </span>
                </div>
                <div className="text-xs text-ink/50 text-right -mt-4 mb-6">(Inclusive of all applicable taxes)</div>
                
                <div className="flex items-start gap-3 text-xs text-ink/60 leading-relaxed bg-silver-light/50 p-4 rounded-sm border border-silver/20">
                  <ShieldCheck size={20} className="flex-shrink-0 text-primary" />
                  <span>By completing this purchase, you consent to our Terms of Service and Refund Policy. No card data is stored on our servers.</span>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </div>
    </div>
  );
}
