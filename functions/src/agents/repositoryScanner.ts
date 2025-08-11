// functions/src/agents/repositoryScanner.ts
import { Firestore } from '@google-cloud/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getApiKeys } from '../config/apiKeys';
import { MessageRouter } from '../core/messageRouter';
import { CodeAnalyzer } from '../services/codeAnalyzer';
import { GitService, createGitService } from '../services/gitService';
import { Logger } from '../utils/logger';

export class RepositoryScanner {
    private gemini: GoogleGenerativeAI;
    private model: any;
    private codeAnalyzer: CodeAnalyzer;
    private gitService: GitService;
    private mode: string = 'continuous';
    private focusArea: string = 'general';
    private busy: boolean = false;
    private lastScanTime: number = 0;

    constructor(
        private id: string,
        private db: Firestore,
        private messageRouter: MessageRouter,
        private logger: Logger
    ) {
        const apiKeys = getApiKeys();
        this.gemini = new GoogleGenerativeAI(apiKeys.gemini);
        this.model = this.gemini.getGenerativeModel({ model: 'gemini-1.5-pro' });
        this.codeAnalyzer = new CodeAnalyzer();
        // GitService will be created when needed with specific repo config
        this.gitService = null as any; // Initialize as null, create when needed
        this.initialize();
    }

    private getGitService(repoUrl?: string, token?: string): GitService {
        if (!this.gitService && repoUrl) {
            this.gitService = createGitService(repoUrl, token);
        }
        return this.gitService;
    }

    private initialize() {
        this.logger.info(`Initializing Repository Scanner ${this.id}`);

        if (this.id === 'core') {
            // Core scanner starts continuous monitoring
            this.startContinuousMonitoring();
        }
    }

    private startContinuousMonitoring() {
        setInterval(async () => {
            if (!this.busy) {
                await this.performIncrementalScan();
            }
        }, 60000); // Every minute
    }

    async setMode(mode: string) {
        this.mode = mode;
        this.logger.info(`Scanner ${this.id} set to ${mode} mode`);
    }

    async setFocusArea(area: string) {
        this.focusArea = area;
        this.logger.info(`Scanner ${this.id} focusing on ${area}`);
    }

    async performScan(options: any): Promise<any> {
        this.busy = true;
        const startTime = Date.now();

        try {
            // Get repository state
            const repoState = await this.gitService.getRepositoryState();

            // Perform code analysis based on options
            const analysis = await this.analyzeRepository(repoState, options);

            // Generate insights using Gemini
            const insights = await this.generateInsights(analysis, options);

            // Store results
            await this.storeResults(insights);

            // Report to user compilers
            await this.reportToCompilers(insights);

            this.lastScanTime = Date.now();

            return {
                scannerId: this.id,
                duration: Date.now() - startTime,
                findings: insights.findings,
                metrics: insights.metrics,
                recommendations: insights.recommendations
            };
        } finally {
            this.busy = false;
        }
    }

    private async analyzeRepository(repoState: any, options: any) {
        const analysis: any = {
            files: [],
            dependencies: null,
            metrics: null,
            patterns: null,
            issues: []
        };

        // Analyze based on depth
        switch (options.depth) {
            case 'shallow':
                analysis.files = await this.codeAnalyzer.getChangedFiles(repoState);
                break;
            case 'medium':
                analysis.files = await this.codeAnalyzer.analyzeFiles(repoState.files);
                if (options.analyzeDependencies) {
                    analysis.dependencies = await this.codeAnalyzer.analyzeDependencies();
                }
                break;
            case 'deep':
                analysis.files = await this.codeAnalyzer.deepAnalyze(repoState.files);
                analysis.dependencies = await this.codeAnalyzer.analyzeDependencies();
                analysis.metrics = await this.codeAnalyzer.calculateMetrics();
                if (options.detectPatterns) {
                    analysis.patterns = await this.codeAnalyzer.detectPatterns();
                }
                break;
            case 'maximum':
                analysis.files = await this.codeAnalyzer.fullAnalysis(repoState.files);
                analysis.dependencies = await this.codeAnalyzer.analyzeDependencies();
                analysis.metrics = await this.codeAnalyzer.calculateMetrics();
                analysis.patterns = await this.codeAnalyzer.detectPatterns();

                if (options.vulnerabilityAnalysis) {
                    analysis.vulnerabilities = await this.codeAnalyzer.scanVulnerabilities();
                }
                if (options.performanceProfile) {
                    analysis.performance = await this.codeAnalyzer.profilePerformance();
                }
                if (options.architectureReview) {
                    analysis.architecture = await this.codeAnalyzer.reviewArchitecture();
                }
                break;
        }

        // Focus area specific analysis
        if (options.focus && options.focus !== 'general') {
            analysis.focusAnalysis = await this.analyzeFocusArea(options.focus, repoState);
        }

        return analysis;
    }

    private async analyzeFocusArea(focus: string, repoState: any) {
        switch (focus) {
            case 'security':
                return await this.codeAnalyzer.securityAnalysis(repoState);
            case 'performance':
                return await this.codeAnalyzer.performanceAnalysis(repoState);
            case 'architecture':
                return await this.codeAnalyzer.architectureAnalysis(repoState);
            case 'dependencies':
                return await this.codeAnalyzer.dependencyAnalysis(repoState);
            case 'quality':
                return await this.codeAnalyzer.qualityAnalysis(repoState);
            case 'changes_only':
                return await this.codeAnalyzer.changeAnalysis(repoState);
            case 'incremental':
                return await this.codeAnalyzer.incrementalAnalysis(repoState, this.lastScanTime);
            default:
                return null;
        }
    }

    private async generateInsights(analysis: any, options: any) {
        const prompt = `
    Analyze the repository scan results and provide insights:
    
    Scanner: ${this.id}
    Mode: ${this.mode}
    Focus Area: ${this.focusArea}
    
    Analysis Results:
    ${JSON.stringify(analysis, null, 2)}
    
    Generate insights including:
    1. Critical findings that need immediate attention
    2. Code quality issues and improvements
    3. Security vulnerabilities or concerns
    4. Performance bottlenecks
    5. Architectural recommendations
    6. Dependency issues
    
    Return as JSON with structure:
    {
      "findings": [
        {
          "type": "security|performance|quality|architecture|dependency",
          "severity": "critical|high|medium|low",
          "location": "file path or component",
          "description": "detailed description",
          "impact": "impact description",
          "suggestion": "how to fix"
        }
      ],
      "metrics": {
        "files": number,
        "lines": number,
        "complexity": number,
        "coverage": number,
        "performance": number
      },
      "recommendations": [
        {
          "type": "immediate|short-term|long-term",
          "priority": 1-5,
          "description": "recommendation",
          "effort": "low|medium|high"
        }
      ],
      "summary": "overall summary"
    }`;

        const result = await this.model.generateContent(prompt);
        return JSON.parse(result.response.text());
    }

    async performTargetedScan(target: any): Promise<any> {
        this.busy = true;

        try {
            const targetAnalysis = await this.codeAnalyzer.analyzeTarget(target);

            const prompt = `
      Perform targeted analysis on:
      ${JSON.stringify(target, null, 2)}
      
      Analysis results:
      ${JSON.stringify(targetAnalysis, null, 2)}
      
      Provide specific insights and recommendations.`;

            const result = await this.model.generateContent(prompt);
            return JSON.parse(result.response.text());
        } finally {
            this.busy = false;
        }
    }

    private async performIncrementalScan() {
        const changes = await this.gitService.getChangesSince(this.lastScanTime);

        if (changes.length > 0) {
            await this.performScan({
                depth: 'shallow',
                focus: 'incremental',
                includeMetrics: true
            });
        }
    }

    private async storeResults(insights: any) {
        await this.db.collection('scan_results').add({
            scannerId: this.id,
            timestamp: Date.now(),
            mode: this.mode,
            focusArea: this.focusArea,
            insights
        });
    }

    private async reportToCompilers(insights: any) {
        // Send relevant insights to user compilers
        const relevantFindings = insights.findings.filter((f: any) =>
            f.severity === 'critical' || f.severity === 'high'
        );

        if (relevantFindings.length > 0) {
            await this.messageRouter.sendMessage({
                type: 'SCAN_INSIGHTS',
                source: `repository_scanner_${this.id}`,
                target: 'all_user_compilers',
                payload: {
                    findings: relevantFindings,
                    summary: insights.summary
                },
                priority: 2,
                timestamp: Date.now()
            });
        }
    }

    isBusy(): boolean {
        return this.busy;
    }

    async cleanup() {
        this.logger.info(`Cleaning up scanner ${this.id}`);
        // Any cleanup needed
    }
}
