import { demoReviewGroups } from "../src/features/ai-review/fixtures";
import {
  acceptAllInGroup,
  acceptedCandidates,
  rejectAllInGroup,
  reviewDisclaimer,
  setCandidateStatus,
  summarizeReview,
} from "../src/features/ai-review/model";

describe("fixtures", () => {
  it("gives every candidate non-empty explainable evidence", () => {
    for (const group of demoReviewGroups) {
      for (const candidate of group.candidates) {
        expect(candidate.evidence.length).toBeGreaterThan(0);
      }
    }
  });

  it("never claims face or place recognition", () => {
    const allText = JSON.stringify(demoReviewGroups) + reviewDisclaimer;

    expect(allText).not.toContain("人脸");
    expect(allText).not.toContain("识别出");
    expect(reviewDisclaimer).toContain("不会识别");
  });
});

describe("setCandidateStatus", () => {
  it("accepts a single candidate", () => {
    const next = setCandidateStatus(
      demoReviewGroups,
      "candidate-cover-headline",
      "accepted"
    );

    expect(summarizeReview(next)).toEqual({
      total: 3,
      pending: 2,
      accepted: 1,
      rejected: 0,
    });
  });

  it("rejects a single candidate without touching the others", () => {
    const next = setCandidateStatus(
      demoReviewGroups,
      "candidate-city-phrase",
      "rejected"
    );

    const untouched = next[0].candidates.map((candidate) => candidate.status);
    expect(untouched).toEqual(["pending", "pending"]);
  });

  it("returns an equal structure for an unknown id", () => {
    expect(setCandidateStatus(demoReviewGroups, "missing", "accepted")).toEqual(
      demoReviewGroups
    );
  });

  it("does not mutate the input", () => {
    setCandidateStatus(demoReviewGroups, "candidate-cover-headline", "accepted");

    expect(demoReviewGroups[0].candidates[0].status).toBe("pending");
  });
});

describe("batch operations", () => {
  it("accepts all pending candidates in one group only", () => {
    const next = acceptAllInGroup(demoReviewGroups, "group-structure");

    expect(next[0].candidates.every((candidate) => candidate.status === "accepted")).toBe(true);
    expect(next[1].candidates[0].status).toBe("pending");
  });

  it("rejects all pending candidates in a group", () => {
    const next = rejectAllInGroup(demoReviewGroups, "group-copy");

    expect(next[1].candidates[0].status).toBe("rejected");
  });

  it("leaves already-decided candidates unchanged during batch accept", () => {
    const decided = setCandidateStatus(
      demoReviewGroups,
      "candidate-photo-pages",
      "rejected"
    );
    const next = acceptAllInGroup(decided, "group-structure");

    expect(next[0].candidates.map((candidate) => candidate.status)).toEqual([
      "accepted",
      "rejected",
    ]);
  });
});

describe("acceptedCandidates", () => {
  it("only returns explicitly accepted candidates", () => {
    expect(acceptedCandidates(demoReviewGroups)).toEqual([]);

    const next = setCandidateStatus(
      demoReviewGroups,
      "candidate-photo-pages",
      "accepted"
    );
    expect(acceptedCandidates(next).map((candidate) => candidate.id)).toEqual([
      "candidate-photo-pages",
    ]);
  });
});
