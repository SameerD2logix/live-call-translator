import "server-only";
import { deleteVoiceViaGateway } from "./gateway-admin";
import { getVoiceProfile, removeVoiceProfile } from "./repository";

/**
 * Deletes the user's voice everywhere: first at the provider, then in our database.
 * Order matters: if the provider call fails we keep our row (and throw), so the user can
 * retry and we never lose track of a clone that still exists.
 * Used by "Delete my voice" and by account deletion.
 */
export async function deleteVoiceForUser(userId: string): Promise<void> {
  const voice = await getVoiceProfile(userId);
  if (!voice) return;
  await deleteVoiceViaGateway(userId, voice.providerVoiceId);
  await removeVoiceProfile(userId);
}
