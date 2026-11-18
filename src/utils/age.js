/** Age from date of birth when known, otherwise the self-reported age. */
export const ageInYears = (p) => {
  if (!p?.dateOfBirth) return p?.age ?? null;
  const dob = new Date(p.dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age -= 1;
  return age;
};
