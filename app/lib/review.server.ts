import { transaction } from "./db.server";

export class CandidateReviewConflictError extends Error {
  constructor() {
    super("候选记录已被其他审核操作处理，请刷新后重试");
    this.name = "CandidateReviewConflictError";
  }
}

export class CandidateReviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandidateReviewValidationError";
  }
}

export async function rejectPendingCandidates(candidateIds: string[], reviewerId: string) {
  const ids = [...new Set(candidateIds)].sort();
  if (!ids.length) return 0;
  return transaction(async (client) => {
    const candidates = await client.query<{ id: string; status: string }>(
      `select id, status from extraction_candidates
       where id = any($1::uuid[])
       order by id
       for update`,
      [ids],
    );
    if (candidates.rows.length !== ids.length || candidates.rows.some((candidate) => candidate.status !== "pending")) {
      throw new CandidateReviewConflictError();
    }
    const result = await client.query(
      `update extraction_candidates
       set status = 'rejected', reviewed_by = $2, reviewed_at = now()
       where id = any($1::uuid[]) and status = 'pending'`,
      [ids, reviewerId],
    );
    if (result.rowCount !== ids.length) throw new CandidateReviewConflictError();
    return result.rowCount ?? 0;
  });
}
