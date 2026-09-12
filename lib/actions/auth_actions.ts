'use server'; 
import {auth} from '@/lib/better-auth/auth'
import {inngest} from "@/lib/inngest/client";

export const signUpWithEmail = async ({email, password, fullName, country, investmentGoals, riskTolerance, preferredIndustry}: SignUpFormData) => {
    try{
        const response = await auth.api.signUpEmail({
            body: {
                email: email,
                password: password,
                name : fullName,
            }
        })

        if(response){
            await inngest.send({
                name: 'app/user.created',
                data: {
                    email,
                    name: fullName,
                    country,
                    investmentGoals,
                    riskTolerance,
                    preferredIndustry,

                }
            })
        }

        return {success: true, data: response};

    } catch (e){
        console.log("Sign up email failed", e);
        return {success: false, error: "Sign up email failed"};
    }
}



export const signInWithEmail = async ({ email, password }: SignInFormData) => {
    try {
        const response = await auth.api.signInEmail({ body: { email, password } })

        return { success: true, data: response }
    } catch (e) {
        console.log('Sign in failed', e)
        return { success: false, error: 'Sign in failed' }
    }
}

export const signOut = async () => {
    try {
        await auth.api.signOut({ headers: await headers() });
    } catch (e) {
        console.log('Sign out failed', e)
        return { success: false, error: 'Sign out failed' }
    }
}