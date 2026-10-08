import "server-only";
export { dashboardService, notificationService } from "./account";
export { paymentService } from "./payments";
export { authService, userService } from "./auth-users";
export { enrollmentService, materialService, platformService, searchService, subjectService, topicService } from "./catalog";
export { questionService, testResultService, testService } from "./assessment";
export { certificateService, examService, progressService, rankingService } from "./learning";
export { statsService } from "./stats";
