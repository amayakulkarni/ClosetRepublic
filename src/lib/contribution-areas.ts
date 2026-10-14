// The three kinds of contribution that have their own tab and sign-up form on /development.
// Shared by the server and the browser, so no server-only imports here.

export type ContributionArea = 'constitution' | 'writing' | 'art';
export const CONTRIBUTION_AREAS: ContributionArea[] = ['constitution', 'writing', 'art'];

export const AREA_LABEL: Record<ContributionArea, { plain: string; nature: string }> = {
  constitution: { plain: 'Constitution', nature: 'Constitutional Assembly' },
  writing: { plain: 'Writing', nature: 'Gazette Press' },
  art: { plain: 'Artwork', nature: 'Ministry of Arts' },
};

export type ContributorStatus = 'new' | 'verifying' | 'verified' | 'declined';
export const CONTRIBUTOR_STATUSES: ContributorStatus[] = ['new', 'verifying', 'verified', 'declined'];
