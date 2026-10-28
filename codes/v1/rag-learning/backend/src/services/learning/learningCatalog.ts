// Authored discovery metadata only. No remote lesson content is fetched or indexed.
export const learningCatalog = {
  exercise: {
    id: 'grove-function-graph-matching',
    revision: 1,
    title: 'Match equations to graphs',
    description: 'Compare slopes, turning points, and asymptotes across four graphs.',
    provenance: 'Original Grove exercise',
    curriculum: 'HK Maths · Functions and graphs',
  },
  resources: [
    {
      id: 'hanlun-maths-directory',
      title: 'Hanlun maths directory',
      description: 'Browse the publisher’s maths modules and prerequisite links.',
      url: 'https://www.hanlunelr.com/content/repository/toc-maths.html',
      sourceModuleId: null,
      curriculumMappings: [],
    },
    {
      id: 'hanlun-function-graphs',
      title: 'Functions and graphs · 函數的圖像',
      description: 'Module overview and learning objectives on the original site.',
      url: 'https://www.hanlunelr.com/content/Maths_Shirley_M23/index.html',
      sourceModuleId: 'Maths_Shirley_M23',
      curriculumMappings: [
        { unitCode: 'CP02', title: 'Functions and graphs', status: 'candidate' },
      ],
    },
    {
      id: 'hanlun-function-concepts',
      title: 'Function concepts',
      description: 'A linked introduction to properties used to describe functions.',
      url: 'https://www.hanlunelr.com/content/Maths_Shirley_M23/lesson_1a.html',
      sourceModuleId: 'Maths_Shirley_M23',
      curriculumMappings: [
        { unitCode: 'CP02', title: 'Functions and graphs', status: 'candidate' },
      ],
    },
    {
      id: 'hanlun-graph-activities',
      title: 'Graph activities on Hanlun',
      description: 'Open the publisher’s matching activity and graph demonstrations.',
      url: 'https://www.hanlunelr.com/content/Maths_Shirley_M23/lesson_1b.html',
      sourceModuleId: 'Maths_Shirley_M23',
      curriculumMappings: [
        { unitCode: 'CP02', title: 'Functions and graphs', status: 'candidate' },
      ],
    },
  ].map((resource) => ({
    ...resource,
    type: 'linked_resource',
    publisher: 'Hanlun',
    reuse: 'reference_only',
    verifiedAt: '2026-09-13',
    verification: 'URL and source structure inspected; curriculum mapping is provisional.',
    noticeUrl: 'https://www.hanlunelr.com/content/repository/copyright.html',
  })),
};
