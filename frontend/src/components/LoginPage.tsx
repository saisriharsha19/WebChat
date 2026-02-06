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
                // Correct Argument Order: (username, email, password)
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
        <div className="h-screen w-screen flex items-center justify-center bg-surface-root">
            <div className="w-full max-w-[320px] p-6">
                <div className="mb-8 text-center">
                    <div className="w-10 h-10 bg-white rounded-[8px] mx-auto mb-4 flex items-center justify-center">
                        <svg className="text-black" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    </div>
                    <h1 className="text-[20px] font-semibold text-txt-primary mb-1">{isLogin ? 'Welcome back' : 'Create Account'}</h1>
                    <p className="text-[14px] text-txt-tertiary">
                        {isLogin ? 'Enter your details to access your workspace.' : 'Join your team workspace today.'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-[6px] text-red-400 text-[12px]">
                            {error}
                        </div>
                    )}

                    <div>
                        <input
                            type="text"
                            className="saas-input w-full bg-surface-surface border-border-strong"
                            placeholder="Username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                        />
                    </div>

                    {!isLogin && (
                        <div>
                            <input
                                type="email"
                                className="saas-input w-full bg-surface-surface border-border-strong"
                                placeholder="Email address"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required={!isLogin}
                            />
                        </div>
                    )}

                    <div>
                        <input
                            type="password"
                            className="saas-input w-full bg-surface-surface border-border-strong"
                            placeholder="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full saas-btn-primary h-[40px] flex items-center justify-center"
                    >
                        {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
                    </button>
                </form>

                <div className="mt-6 text-center text-[13px] text-txt-tertiary">
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="text-txt-primary hover:underline">
                        {isLogin ? 'Sign up' : 'Log in'}
                    </button>
                </div>
            </div>
        </div>
    );
}
