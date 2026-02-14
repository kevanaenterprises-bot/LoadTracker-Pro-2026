import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/lib/supabaseCompat';
import DemoExperience from '@/components/DemoExperience';
import {
  Truck, MapPin, FileText, Users, DollarSign, Fuel, Shield, Radar,
  CheckCircle2, ArrowRight, ChevronDown, Star, Zap, Clock, Lock,
  BarChart3, Receipt, Building2, Settings, Phone, Mail, Globe,
  Play, X, Menu, Heart, Target, TrendingUp, Package, Eye,
  Landmark, Volume2, Headphones
} from 'lucide-react';


const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', company: '', email: '', fleetSize: '' });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const featuresRef = useRef<HTMLDivElement>(null);
  const pricingRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<HTMLDivElement>(null);
  const demoExperienceRef = useRef<HTMLDivElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  // When demo becomes visible, scroll to it
  useEffect(() => {
    if (showDemo && demoExperienceRef.current) {
      setTimeout(() => {
        demoExperienceRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }
  }, [showDemo]);

  const handleDemoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setFormSubmitting(true);

    try {
      await db.from('demo_visitors').insert({
        name: formData.name.trim(),
        company_name: formData.company.trim() || null,
        email: formData.email.trim() || null,
        fleet_size: formData.fleetSize || null,
      });
    } catch (err) {
      console.log('Visitor log failed (non-critical):', err);
    }

    setFormSubmitting(false);
    setShowDemo(true);
  };

  const features = [
    {
      icon: <Radar className="w-7 h-7" />,
      title: 'Live GPS Tracking',
      desc: 'Real-time fleet tracking with geofence alerts. Know exactly where every truck is, every minute of every day.',
      color: 'from-emerald-500 to-teal-600',
    },
    {
      icon: <Package className="w-7 h-7" />,
      title: 'Load Management',
      desc: 'Create, dispatch, and track loads from pickup to delivery. Full lifecycle management with status tracking.',
      color: 'from-blue-500 to-indigo-600',
    },
    {
      icon: <Receipt className="w-7 h-7" />,
      title: 'Invoicing & AR',
      desc: 'Generate professional invoices, track payments, manage accounts receivable. Get paid faster.',
      color: 'from-purple-500 to-violet-600',
    },
    {
      icon: <Users className="w-7 h-7" />,
      title: 'Driver Management',
      desc: 'Full driver profiles, document tracking, license expiration alerts, and mobile driver portal.',
      color: 'from-orange-500 to-red-500',
    },
    {
      icon: <Fuel className="w-7 h-7" />,
      title: 'IFTA Reporting',
      desc: 'Automated IFTA fuel tax reporting. Track trips, fuel purchases, and generate quarterly reports. Included — not an add-on.',
      color: 'from-amber-500 to-orange-600',
    },
    {
      icon: <Phone className="w-7 h-7" />,
      title: 'SMS Dispatch',
      desc: 'Send load details directly to drivers via text message. They get a mobile-friendly portal link instantly.',
      color: 'from-cyan-500 to-blue-600',
    },
    {
      icon: <Building2 className="w-7 h-7" />,
      title: 'Customer & Location DB',
      desc: 'Build your customer database and saved locations. Auto-fill on future loads. Work smarter, not harder.',
      color: 'from-pink-500 to-rose-600',
    },
    {
      icon: <DollarSign className="w-7 h-7" />,
      title: 'Rate Matrix',
      desc: 'Save lane rates, track rate history, and quickly price new loads based on your actual data.',
      color: 'from-green-500 to-emerald-600',
    },
    {
      icon: <Shield className="w-7 h-7" />,
      title: 'Staff & Access Control',
      desc: 'Add dispatchers, office staff, and drivers with role-based access. No per-seat charges. Ever.',
      color: 'from-slate-500 to-gray-700',
    },
    {
      icon: <BarChart3 className="w-7 h-7" />,
      title: 'Revenue Analytics',
      desc: 'Dashboard stats, revenue tracking, pipeline visibility. See your business health at a glance.',
      color: 'from-indigo-500 to-purple-600',
    },
    {
      icon: <FileText className="w-7 h-7" />,
      title: 'POD & Document Management',
      desc: 'Upload proof of delivery, BOLs, and rate confirmations. Everything attached to the load, always accessible.',
      color: 'from-teal-500 to-cyan-600',
    },
    {
      icon: <Eye className="w-7 h-7" />,
      title: 'Driver Mobile Portal',
      desc: 'Drivers get their own mobile-friendly portal. View load details, update status, upload PODs — no app download needed.',
      color: 'from-violet-500 to-purple-600',
    },
  ];

  const faqs = [
    {
      q: 'Is there really no per-seat charge?',
      a: 'None. Zero. Add as many dispatchers, office staff, and drivers as you need. Your monthly price stays the same. We believe charging per seat is just a way to nickel-and-dime small carriers.',
    },
    {
      q: 'What integrations are available?',
      a: 'We can integrate with DAT, Intuit/QuickBooks, PrePass, ELD providers, and more. Any system that offers an API, we can connect to it. Each integration is a one-time $200 fee — no monthly upcharge.',
    },
    {
      q: 'Will someone call me if I try the demo?',
      a: 'Absolutely not. We don\'t do that. The visitor form just lets you into the demo — nobody will contact you. If you\'re interested after trying it, YOU reach out to us at kevin@go4fc.com. That\'s it.',
    },
    {
      q: 'What happens to my data in the demo?',
      a: 'The demo is a sandbox with sample data. Nothing you see in the demo is real — it\'s all mock data to show you how the system works. Play around, explore every feature, and see if it fits your operation.',
    },
    {
      q: 'Is IFTA reporting really included?',
      a: 'Yes. Full IFTA reporting — trip logging, fuel purchase tracking, and quarterly report generation. Other TMS platforms charge $100-200/month extra for this. We include it because it should be included.',
    },
    {
      q: 'How is this so affordable?',
      a: 'Because we built it for ourselves first. We\'re not a VC-funded startup trying to hit revenue targets. We\'re a trucking company that built the tool we needed and decided to share it. Low overhead = low price.',
    },
    {
      q: 'Can I switch from my current TMS?',
      a: 'Yes. We\'ll help you migrate your data — customer lists, driver info, rate history. We want the transition to be painless. Reach out and we\'ll walk you through it.',
    },
  ];

  const comparisonItems = [
    { feature: 'Base TMS Platform', them: '$400-700/mo', us: 'Included' },
    { feature: 'Per Additional User/Seat', them: '$25-75/seat/mo', us: 'Free — Unlimited' },
    { feature: 'IFTA Reporting Module', them: '$100-200/mo extra', us: 'Included' },
    { feature: 'Live GPS Tracking', them: '$50-150/mo extra', us: 'Included' },
    { feature: 'Invoicing & AR', them: '$50-100/mo extra', us: 'Included' },
    { feature: 'SMS Driver Dispatch', them: '$25-50/mo extra', us: 'Included' },
    { feature: 'Driver Mobile Portal', them: '$30-75/mo extra', us: 'Included' },
    { feature: 'Document Management', them: 'Often extra', us: 'Included' },
    { feature: 'Third-Party Integration', them: '$50-200/mo each', us: '$200 one-time' },
    { feature: 'Typical Monthly Total', them: '$700-1,200+', us: '$300 flat' },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-xl">
                <Truck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">LoadTracker PRO</h1>
                <p className="text-[10px] text-slate-400 -mt-0.5 tracking-wide">CARRIER TMS</p>
              </div>
            </div>

            {/* Desktop Nav */}
            <div className="hidden lg:flex items-center gap-8">
              <button onClick={() => scrollTo(storyRef)} className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">Our Story</button>
              <button onClick={() => scrollTo(featuresRef)} className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">Features</button>
              <button onClick={() => scrollTo(pricingRef)} className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">Pricing</button>
              <button
                onClick={() => scrollTo(demoRef)}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25"
              >
                Try the Demo
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden p-2 hover:bg-slate-100 rounded-lg">
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-t border-slate-200 px-4 py-4 space-y-2">
            <button onClick={() => scrollTo(storyRef)} className="block w-full text-left px-4 py-3 text-slate-700 hover:bg-slate-50 rounded-lg font-medium">Our Story</button>
            <button onClick={() => scrollTo(featuresRef)} className="block w-full text-left px-4 py-3 text-slate-700 hover:bg-slate-50 rounded-lg font-medium">Features</button>
            <button onClick={() => scrollTo(pricingRef)} className="block w-full text-left px-4 py-3 text-slate-700 hover:bg-slate-50 rounded-lg font-medium">Pricing</button>
            <button onClick={() => scrollTo(demoRef)} className="block w-full text-center px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold">Try the Demo</button>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 lg:pt-24 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://d64gsuwffb70l.cloudfront.net/6983b3d3af6b26bfb6c07812_1770449711467_c21130a4.jpg"
            alt="Highway"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/95 via-slate-900/85 to-slate-900/70"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 border border-blue-400/30 rounded-full mb-6">
                <Heart className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-blue-300">Built by a carrier owner, for carrier owners</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
                Stop Overpaying<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                  for Your TMS
                </span>
              </h1>

              <p className="text-lg lg:text-xl text-slate-300 mb-8 leading-relaxed max-w-xl">
                A full-featured Transportation Management System that doesn't charge you $700+ a month. 
                No per-seat fees. No module add-ons. No sticker shock. Just honest pricing for honest carriers.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => scrollTo(demoRef)}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/30 hover:shadow-blue-600/50 hover:-translate-y-0.5"
                >
                  Try It Free — No Strings
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={() => scrollTo(pricingRef)}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 backdrop-blur-sm text-white border border-white/20 rounded-xl font-bold text-lg hover:bg-white/20 transition-all"
                >
                  See Pricing
                </button>
              </div>

              <div className="flex items-center gap-6 mt-10 pt-8 border-t border-white/10">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">$0</p>
                  <p className="text-xs text-slate-400">Per-seat fees</p>
                </div>
                <div className="w-px h-10 bg-white/20"></div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">12+</p>
                  <p className="text-xs text-slate-400">Features included</p>
                </div>
                <div className="w-px h-10 bg-white/20"></div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">$200</p>
                  <p className="text-xs text-slate-400">One-time integrations</p>
                </div>
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-2xl blur-xl"></div>
                {/* PHOTO: Replace this src with your "standing in front of truck" photo URL */}
                <img
                  src="https://d64gsuwffb70l.cloudfront.net/6983b3d3af6b26bfb6c07812_1770449759802_3b1b85a5.png"
                  alt="LoadTracker PRO Dashboard"
                  className="relative rounded-2xl shadow-2xl border border-white/10"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Bar */}
      <section className="bg-slate-50 border-y border-slate-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-3xl font-bold text-slate-900">100%</p>
              <p className="text-sm text-slate-500 mt-1">Features Included</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900">$0</p>
              <p className="text-sm text-slate-500 mt-1">Hidden Fees</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900">Unlimited</p>
              <p className="text-sm text-slate-500 mt-1">Users & Seats</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900">24/7</p>
              <p className="text-sm text-slate-500 mt-1">System Access</p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Story Section */}
      <section ref={storyRef} className="py-20 lg:py-28 bg-white scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="relative">
              <div className="absolute -inset-6 bg-gradient-to-br from-blue-100 to-cyan-50 rounded-3xl -rotate-2"></div>
              <div className="relative bg-white rounded-2xl shadow-xl p-8 lg:p-10 border border-slate-100">
                <div className="flex items-center gap-4 mb-6">
                  <img
                    src="https://d64gsuwffb70l.cloudfront.net/6983b3d3af6b26bfb6c07812_1770449773066_9dfece9b.jpg"
                    alt="Kevin Owen - Founder"
                    className="w-16 h-16 rounded-full object-cover border-2 border-blue-200"
                  />
                  <div>
                    <p className="font-bold text-slate-900 text-lg">Kevin Owen</p>
                    <p className="text-sm text-slate-500">Founder, LoadTracker PRO</p>
                  </div>
                </div>
                <blockquote className="text-slate-700 text-lg leading-relaxed italic">
                  "I was paying over $700 a month for a TMS. And I wasn't even using half the features. 
                  Want IFTA reporting? That's an extra $200 a month. Need another seat for your dispatcher? 
                  Another $50. It felt like every time I turned around, there was another charge.
                  <br /><br />
                  I'm a transportation owner — just like you. I couldn't understand why basic features 
                  that every carrier needs were treated like premium add-ons. So I went without things 
                  I would have liked, just to keep the bill manageable.
                  <br /><br />
                  That's why I built LoadTracker PRO. A TMS that includes everything a small to mid-size 
                  carrier actually needs — at a price that doesn't make you question your business decisions."
                </blockquote>

                {/* PHOTO: Kevin standing in front of truck */}
                <div className="mt-6 rounded-xl overflow-hidden border border-slate-200">
                  <img
                    src="https://d64gsuwffb70l.cloudfront.net/6983b3d3af6b26bfb6c07812_1770530166498_a4e3e3e1.jpg"
                    alt="Kevin Owen standing in front of his truck"
                    className="w-full h-56 object-cover"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-sm font-semibold mb-4">
                <Target className="w-4 h-4" />
                Our Story
              </div>
              <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 mb-6 leading-tight">
                Built by a Carrier Owner<br />
                <span className="text-blue-600">Who Was Tired of Being Overcharged</span>
              </h2>
              <div className="space-y-6 text-slate-600 text-lg leading-relaxed">
                <p>
                  The big TMS platforms are built for enterprise fleets with hundreds of trucks and deep pockets. 
                  But most carriers in America? We're running 1 to 50 trucks. We need the same tools — 
                  we just shouldn't have to pay enterprise prices for them.
                </p>
                <p>
                  LoadTracker PRO was born out of frustration and built with purpose. Every feature you see 
                  was added because we needed it in our own operation. Not because a product manager 
                  thought it would look good on a sales deck.
                </p>
                <p className="font-semibold text-slate-800">
                  Bottom line: You're getting a robust TMS system without breaking the bank.
                </p>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                  <p className="text-2xl font-bold text-red-600">$700+</p>
                  <p className="text-sm text-red-500 mt-1">What we were paying monthly</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                  <p className="text-2xl font-bold text-green-600">57% Less</p>
                  <p className="text-sm text-green-500 mt-1">What LoadTracker PRO costs</p>
                </div>
              </div>

              {/* PHOTO: Fleet trucks */}
              <div className="mt-8 rounded-xl overflow-hidden border border-slate-200 shadow-lg">
                <img
                  src="https://d64gsuwffb70l.cloudfront.net/6983b3d3af6b26bfb6c07812_1770530181498_d1e1f1a2.jpg"
                  alt="Our fleet of trucks"
                  className="w-full h-48 object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points Section */}
      <section className="py-16 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-extrabold mb-4">Sound Familiar?</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">If you've dealt with any of these, LoadTracker PRO was built for you.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: <DollarSign className="w-6 h-6" />, text: '"Why am I paying $75/month just so my dispatcher can log in?"' },
              { icon: <Fuel className="w-6 h-6" />, text: '"IFTA reporting is a $200/month add-on? For a quarterly report?"' },
              { icon: <Lock className="w-6 h-6" />, text: '"I\'m locked into a contract and the price keeps going up."' },
              { icon: <Zap className="w-6 h-6" />, text: '"I only use 30% of the features but pay for 100% of them."' },
              { icon: <Phone className="w-6 h-6" />, text: '"Their support takes 3 days to respond to a simple question."' },
              { icon: <Settings className="w-6 h-6" />, text: '"Want to integrate with QuickBooks? That\'ll be another $100/month."' },
            ].map((item, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-colors">
                <div className="p-2 bg-red-500/20 rounded-lg w-fit mb-4">
                  {React.cloneElement(item.icon, { className: 'w-6 h-6 text-red-400' })}
                </div>
                <p className="text-slate-300 text-lg italic">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section ref={featuresRef} className="py-20 lg:py-28 bg-slate-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold mb-4">
              <Zap className="w-4 h-4" />
              Everything Included
            </div>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 mb-4">
              Every Feature. One Price.<br />
              <span className="text-blue-600">No Add-Ons. No Surprises.</span>
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Other platforms charge extra for half of these. With LoadTracker PRO, you get the full toolkit from day one.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <div
                key={i}
                className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group"
              >
                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.color} text-white mb-4 group-hover:scale-110 transition-transform`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* History Tour — Driver Experience Section */}
      <section className="py-20 lg:py-28 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-sm font-semibold mb-4">
                <Landmark className="w-4 h-4" />
                Only on LoadTracker PRO
              </div>
              <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 mb-6 leading-tight">
                History Tour:<br />
                <span className="text-amber-600">The Road Comes Alive</span>
              </h2>
              <div className="space-y-5 text-slate-600 text-lg leading-relaxed">
                <p>
                  Here's something no other TMS offers. When your drivers are on the road, LoadTracker PRO's 
                  <strong className="text-slate-800"> History Tour</strong> feature automatically detects historical markers 
                  along their route — and narrates the story of each one, right through their phone speaker.
                </p>
                <p>
                  <strong className="text-slate-800">No stopping. No looking down at a screen. No distraction.</strong> As 
                  they approach within 50 yards of a historical marker, a voice narration begins automatically, 
                  telling the story of that place — who was there, what happened, and why it matters.
                </p>
                <p>
                  There are over <strong className="text-slate-800">200,000 historical markers</strong> across the United States. 
                  Your drivers will hear about Civil War battlefields in Virginia, pioneer trails in Kansas, gold rush 
                  towns in California, and everything in between — all while keeping their eyes on the road and 
                  their hands on the wheel.
                </p>
                <p className="font-semibold text-slate-800">
                  It's education, entertainment, and a reason for your drivers to actually enjoy the miles.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Feature highlight cards */}
              <div className="bg-white rounded-2xl shadow-xl border border-amber-200 p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-100 to-transparent rounded-bl-full"></div>
                <div className="relative">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl text-white">
                      <Volume2 className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">Automatic Voice Narration</h3>
                      <p className="text-sm text-slate-500">AI-powered storytelling, hands-free</p>
                    </div>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    When a driver comes within 50 yards of a historical marker, a rich voice narration 
                    plays automatically. The driver never has to touch their phone — the story just begins. 
                    It's like having a knowledgeable tour guide riding shotgun.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl shadow-md border border-amber-100 p-5">
                  <div className="p-2 bg-amber-100 rounded-lg w-fit mb-3">
                    <Headphones className="w-5 h-5 text-amber-600" />
                  </div>
                  <h4 className="font-bold text-slate-900 mb-1">Hands-Free</h4>
                  <p className="text-sm text-slate-500">Eyes on the road, ears on the story. Zero distraction.</p>
                </div>
                <div className="bg-white rounded-xl shadow-md border border-amber-100 p-5">
                  <div className="p-2 bg-amber-100 rounded-lg w-fit mb-3">
                    <MapPin className="w-5 h-5 text-amber-600" />
                  </div>
                  <h4 className="font-bold text-slate-900 mb-1">200,000+ Markers</h4>
                  <p className="text-sm text-slate-500">Every state, every highway. History is everywhere.</p>
                </div>
                <div className="bg-white rounded-xl shadow-md border border-amber-100 p-5">
                  <div className="p-2 bg-amber-100 rounded-lg w-fit mb-3">
                    <Landmark className="w-5 h-5 text-amber-600" />
                  </div>
                  <h4 className="font-bold text-slate-900 mb-1">Never Stop</h4>
                  <p className="text-sm text-slate-500">Hear the history without ever pulling over.</p>
                </div>
                <div className="bg-white rounded-xl shadow-md border border-amber-100 p-5">
                  <div className="p-2 bg-amber-100 rounded-lg w-fit mb-3">
                    <Truck className="w-5 h-5 text-amber-600" />
                  </div>
                  <h4 className="font-bold text-slate-900 mb-1">Driver Morale</h4>
                  <p className="text-sm text-slate-500">Makes the long haul more interesting and engaging.</p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl p-5 text-white">
                <p className="font-semibold text-lg mb-1">
                  "It's like a podcast that knows exactly where you are."
                </p>
                <p className="text-amber-100 text-sm">
                  — Built into the Driver Portal. No extra app. No extra cost. Included with LoadTracker PRO.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Table */}

      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 mb-4">
              The Real Cost Comparison
            </h2>
            <p className="text-lg text-slate-500">See what you're actually paying with "affordable" TMS platforms vs. LoadTracker PRO.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-3 bg-slate-900 text-white">
              <div className="p-4 lg:p-6 font-bold text-sm lg:text-base">Feature</div>
              <div className="p-4 lg:p-6 font-bold text-center text-sm lg:text-base text-red-300">Typical TMS</div>
              <div className="p-4 lg:p-6 font-bold text-center text-sm lg:text-base text-emerald-300">LoadTracker PRO</div>
            </div>
            {comparisonItems.map((item, i) => (
              <div key={i} className={`grid grid-cols-3 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} ${i === comparisonItems.length - 1 ? 'font-bold bg-slate-100' : ''}`}>
                <div className="p-4 lg:p-5 text-sm lg:text-base text-slate-700 border-r border-slate-200">{item.feature}</div>
                <div className="p-4 lg:p-5 text-sm lg:text-base text-center text-red-600 border-r border-slate-200">{item.them}</div>
                <div className="p-4 lg:p-5 text-sm lg:text-base text-center text-emerald-600 font-semibold">
                  <span className="inline-flex items-center gap-1">
                    {item.us === 'Included' && <CheckCircle2 className="w-4 h-4" />}
                    {item.us}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section ref={pricingRef} className="py-20 lg:py-28 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-full text-sm font-semibold mb-4 border border-blue-400/30">
              <DollarSign className="w-4 h-4" />
              Honest, Upfront Pricing
            </div>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-white mb-4">
              Simple Pricing. No Sticker Shock.
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              What you see is what you pay. No hidden fees, no surprise charges, no "call for pricing" games.
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            {/* Single Flat Rate Card */}
            <div className="relative bg-gradient-to-b from-blue-600 to-blue-700 border-2 border-blue-400 rounded-2xl p-10 shadow-2xl shadow-blue-500/30">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-1.5 bg-amber-400 text-amber-900 rounded-full text-sm font-bold">
                ALL-INCLUSIVE
              </div>
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-white mb-2">LoadTracker PRO</h3>
                <p className="text-blue-200">Every feature. Every user. One price.</p>
              </div>
              <div className="text-center mb-8">
                <span className="text-6xl lg:text-7xl font-extrabold text-white">$300</span>
                <span className="text-blue-200 text-xl">/month</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 mb-10">
                {[
                  'All 12+ features included',
                  'Unlimited users & seats',
                  'Live GPS tracking',
                  'IFTA reporting',
                  'Invoicing & AR',
                  'Driver mobile portal',
                  'SMS dispatch',
                  'Rate matrix & lane history',
                  'Revenue analytics',
                  'Customer & location database',
                  'Document management',
                  'Staff & access control',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm text-blue-100">
                    <CheckCircle2 className="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5" />
                    {item}
                  </div>
                ))}
              </div>
              <button
                onClick={() => scrollTo(demoRef)}
                className="w-full py-4 bg-white text-blue-700 rounded-xl font-bold text-lg hover:bg-blue-50 transition-colors shadow-lg"
              >
                Try the Demo
              </button>
              <p className="text-center text-blue-200 text-sm mt-4">No contracts. No per-seat fees. No add-on charges.</p>
            </div>
          </div>

          {/* Integration Pricing */}
          <div className="mt-16 max-w-3xl mx-auto">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center">
              <h3 className="text-2xl font-bold text-white mb-3">Need an Integration?</h3>
              <p className="text-slate-400 mb-6 max-w-xl mx-auto">
                DAT, Intuit/QuickBooks, PrePass, ELD providers — if it has an API, we can connect it.
              </p>
              <div className="inline-flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-extrabold text-white">$200</span>
                <span className="text-slate-400 text-lg">one-time fee per integration</span>
              </div>
              <p className="text-emerald-400 font-semibold text-sm">
                Not $200/month. Not $200/year. One time. That's it.
              </p>
              <div className="flex flex-wrap justify-center gap-3 mt-6">
                {['DAT', 'QuickBooks', 'PrePass', 'Samsara', 'KeepTruckin', 'Motive', 'Trimble', 'Custom API'].map((name) => (
                  <span key={name} className="px-3 py-1.5 bg-white/10 border border-white/10 rounded-lg text-sm text-slate-300">{name}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 mb-4">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-100 transition-colors"
                >
                  <span className="font-semibold text-slate-900 pr-4">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${activeFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {activeFaq === i && (
                  <div className="px-5 pb-5">
                    <p className="text-slate-600 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Access Section */}
      <section ref={demoRef} className="py-20 lg:py-28 bg-gradient-to-br from-blue-50 to-cyan-50 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {!showDemo ? (
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold mb-4">
                  <Play className="w-4 h-4" />
                  Try It Yourself
                </div>
                <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 mb-6 leading-tight">
                  See It in Action.<br />
                  <span className="text-blue-600">No Sales Pitch. No Follow-Up Calls.</span>
                </h2>
                <div className="space-y-4 text-slate-600 text-lg leading-relaxed">
                  <p>
                    Fill out the form and you'll get instant access to the LoadTracker PRO interactive demo 
                    right here on this page. Explore every feature with sample data.
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="p-1 bg-emerald-100 rounded-full mt-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      </div>
                      <p><strong>Nobody will contact you.</strong> We mean it. No calls, no emails, no "just checking in" messages.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-1 bg-emerald-100 rounded-full mt-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      </div>
                      <p><strong>It's a sandbox with sample data.</strong> Explore the dashboard, load management, tracking, invoicing, IFTA — everything.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-1 bg-emerald-100 rounded-full mt-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      </div>
                      <p><strong>If you're interested afterward</strong>, send an email to <a href="mailto:kevin@go4fc.com" className="text-blue-600 font-semibold hover:underline">kevin@go4fc.com</a>. That's the only way we'll talk.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 lg:p-10">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Enter the Demo</h3>
                  <p className="text-slate-500 mb-6">Just your name is required. Everything else is optional.</p>

                  <form onSubmit={handleDemoSubmit} className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Your Name *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="John Smith"
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Company Name</label>
                      <input
                        type="text"
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        placeholder="Smith Trucking LLC"
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Email (optional)</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="john@smithtrucking.com"
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Fleet Size</label>
                      <select
                        value={formData.fleetSize}
                        onChange={(e) => setFormData({ ...formData, fleetSize: e.target.value })}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select...</option>
                        <option value="1-3">1-3 trucks</option>
                        <option value="4-10">4-10 trucks</option>
                        <option value="11-20">11-20 trucks</option>
                        <option value="21-50">21-50 trucks</option>
                        <option value="50+">50+ trucks</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={formSubmitting || !formData.name.trim()}
                      className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {formSubmitting ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Loading Demo...
                        </>
                      ) : (
                        <>
                          Launch Interactive Demo
                          <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </button>

                    <p className="text-xs text-slate-400 text-center mt-3">
                      We will NOT contact you. This form just logs your visit so you can access the demo.
                    </p>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            /* Interactive Demo Experience */
            <div ref={demoExperienceRef}>
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold mb-4">
                  <CheckCircle2 className="w-4 h-4" />
                  Demo Active — Explore LoadTracker PRO
                </div>
                <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 mb-3">
                  Welcome, {formData.name}!
                </h2>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-2">
                  This is an interactive demo with sample data. Click around, explore every feature, and see how LoadTracker PRO can run your operation.
                </p>
                <p className="text-sm text-slate-400">
                  Interested? Email <a href="mailto:kevin@go4fc.com" className="text-blue-600 font-semibold hover:underline">kevin@go4fc.com</a> — that's the only way we'll talk.
                </p>
              </div>

              <DemoExperience />

              <div className="mt-8 text-center">
                <button
                  onClick={() => setShowDemo(false)}
                  className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition-colors mr-4"
                >
                  Close Demo
                </button>
                <a
                  href="mailto:kevin@go4fc.com?subject=Interested in LoadTracker PRO"
                  className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg"
                >
                  <Mail className="w-5 h-5" />
                  I'm Interested — Email Kevin
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Already a Customer? */}
      <section className="py-12 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-slate-400 mb-4">Already a LoadTracker PRO customer?</p>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-8 py-3 bg-white/10 border border-white/20 text-white rounded-xl font-semibold hover:bg-white/20 transition-colors"
          >
            <Lock className="w-4 h-4" />
            Sign In to Your Account
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-600 rounded-xl">
                  <Truck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">LoadTracker PRO</h3>
                  <p className="text-xs text-slate-500">Carrier TMS</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Built by a transportation owner who was tired of overpaying for software. 
                Simple, powerful, affordable.
              </p>
              <div className="flex items-center gap-3 mt-4">
                <img
                  src="https://d64gsuwffb70l.cloudfront.net/69770a8f83fbc738004b0074_1770447980201_ca86907e.png"
                  alt="Turtle Logistics"
                  className="w-8 h-8 rounded-full object-contain"
                />
                <div>
                  <p className="text-xs text-slate-400">Powered by <span className="text-pink-400">Turtle Logistics</span></p>
                  <p className="text-[10px] text-slate-500 italic">"We may be slow, but we deliver fast"</p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-white mb-4">Features</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>Load Management</li>
                <li>Live GPS Tracking</li>
                <li>Invoicing & AR</li>
                <li>IFTA Reporting</li>
                <li>Driver Management</li>
                <li>SMS Dispatch</li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-white mb-4">Pricing</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>All-Inclusive TMS — $300/mo</li>
                <li>Unlimited users & seats</li>
                <li>Every feature included</li>
                <li>Integrations — $200 one-time</li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-white mb-4">Contact</h4>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-400" />
                  <a href="mailto:kevin@go4fc.com" className="hover:text-white transition-colors">kevin@go4fc.com</a>
                </li>
                <li className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-400" />
                  <span>LoadTracker PRO</span>
                </li>
              </ul>
              <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-xl">
                <p className="text-xs text-slate-400">
                  Interested? Just email us. We don't do cold calls, 
                  pushy sales, or "limited time offers." 
                  We're truckers, not telemarketers.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-800">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
              <p className="text-sm text-slate-500">
                &copy; {new Date().getFullYear()} LoadTracker PRO. All rights reserved.
              </p>
              <p className="text-sm text-slate-500">
                Built with purpose. Priced with honesty.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-4 border-t border-slate-800/50">
              <p className="text-xs text-slate-600 text-center">
                <span className="text-slate-500 font-medium">GO Farms & Cattle</span> is the parent company of{' '}
                <span className="text-pink-400 font-medium">Turtle Logistics</span>
              </p>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
};

export default LandingPage;
