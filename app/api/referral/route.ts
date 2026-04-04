import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/referral?userId=xxx
 *
 * Returns the user's referral code and stats.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Get user's referral code
  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.referral_code) {
    return NextResponse.json({ referralCode: null, stats: null });
  }

  // Get referral stats
  const { data: referrals } = await supabase
    .from('referrals')
    .select('id, referred_email, status, created_at')
    .eq('referrer_user_id', userId)
    .order('created_at', { ascending: false });

  const total = referrals?.length ?? 0;
  const completed = referrals?.filter((r) => r.status === 'completed' || r.status === 'rewarded').length ?? 0;
  const rewarded = referrals?.filter((r) => r.status === 'rewarded').length ?? 0;

  // Get reward value from config
  const { data: rewardConfig } = await supabase
    .from('admin_config')
    .select('value')
    .eq('key', 'referral_reward_value')
    .maybeSingle();
  const rewardValue = (rewardConfig?.value as number) ?? 10;

  return NextResponse.json({
    referralCode: profile.referral_code,
    rewardValue,
    stats: {
      total,
      completed,
      rewarded,
    },
    referrals: referrals ?? [],
  });
}
