import { useState } from 'react';
import { useAuth } from '../AuthContext';

export default function LoginPage() {
    const { login, register } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isLogin) {
                await login(username, password);
            } else {
                await register(username, email, password);
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0b] relative overflow-hidden">

            <div className="w-full max-w-[380px] p-8 m-4 glass-panel rounded-2xl relative z-10 animate-fade-in border border-white/5 shadow-2xl backdrop-blur-xl bg-[#111113]/60">
                <div className="mb-8 text-center">
                    <div className="w-12 h-12 bg-[#6366f1] rounded-xl mx-auto mb-5 flex items-center justify-center shadow-lg shadow-[#6366f1]/20">
                        <svg className="text-white" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    </div>
                    <h1 className="text-[24px] font-bold text-white mb-2 tracking-tight">{isLogin ? 'Welcome back' : 'Create Account'}</h1>
                    <p className="text-[14px] text-txt-secondary leading-relaxed">
                        {isLogin ? 'Enter your credentials to access your workspace.' : 'Join your team and start collaborating today.'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-[13px] font-medium text-center animate-slide-up">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-[11px] font-bold text-txt-tertiary uppercase tracking-wider mb-1.5 ml-1">Username</label>
                            <input
                                type="text"
                                className="w-full bg-[#0a0a0b]/50 border border-[#3f3f46] focus:border-[#6366f1] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-txt-tertiary focus:outline-none focus:ring-1 focus:ring-[#6366f1]/50 transition-all duration-200"
                                placeholder="Enter username"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                required
                            />
                        </div>

                        {!isLogin && (
                            <div className="animate-slide-up">
                                <label className="block text-[11px] font-bold text-txt-tertiary uppercase tracking-wider mb-1.5 ml-1">Email</label>
                                <input
                                    type="email"
                                    className="w-full bg-[#0a0a0b]/50 border border-[#3f3f46] focus:border-[#6366f1] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-txt-tertiary focus:outline-none focus:ring-1 focus:ring-[#6366f1]/50 transition-all duration-200"
                                    placeholder="name@company.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required={!isLogin}
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-[11px] font-bold text-txt-tertiary uppercase tracking-wider mb-1.5 ml-1">Password</label>
                            <input
                                type="password"
                                className="w-full bg-[#0a0a0b]/50 border border-[#3f3f46] focus:border-[#6366f1] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-txt-tertiary focus:outline-none focus:ring-1 focus:ring-[#6366f1]/50 transition-all duration-200"
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white font-medium h-[44px] rounded-lg flex items-center justify-center transition-all duration-200 mt-6 shadow-lg shadow-[#6366f1]/20 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (isLogin ? 'Sign In' : 'Create Account')}
                    </button>
                </form>

                <div className="mt-8 text-center text-[13px] text-txt-tertiary">
                    {isLogin ? "New to the platform? " : "Already have an account? "}
                    <button
                        onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        className="text-indigo-400 hover:text-indigo-300 font-medium hover:underline transition-colors"
                    >
                        {isLogin ? 'Create an account' : 'Sign in here'}
                    </button>
                </div>
            </div>
        </div>
    );
}
