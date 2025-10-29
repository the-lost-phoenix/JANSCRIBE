'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Signup() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [message, setMessage] = useState('')
    const router = useRouter()
    const supabase = createClient()

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault()
        setMessage('')
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${location.origin}/auth/callback` },
        })
        if (error) setMessage(`Signup failed: ${error.message}`)
        else setMessage('Signup successful! Please check your email to confirm.')
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <Card className="w-full max-w-sm">
                <CardHeader><CardTitle className="text-2xl text-center">Sign Up for JanScribe</CardTitle></CardHeader>
                <CardContent>
                    <form onSubmit={handleSignUp}>
                        <div className="grid gap-4">
                            <div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" placeholder="name@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                            <div className="grid gap-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                            <Button type="submit" className="w-full">Sign Up</Button>
                            <Button variant="outline" className="w-full" onClick={() => router.push('/login')}>Already have an account? Log In</Button>
                            {message && <p className="text-sm text-center text-red-600">{message}</p>}
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}