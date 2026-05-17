'use client';

import { useState } from 'react';
import { ChevronDown, Search, Filter, Plus, TrendingUp, Target, Zap } from 'lucide-react';

export default function KeywordsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedIntent, setSelectedIntent] = useState('all');
  const [sortBy, setSortBy] = useState('volume');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  // Mock data
  const allKeywords = [
    {
      id: 1,
      keyword: 'AI SEO tools',
      volume: 12400,
      kd: 28,
      intent: 'Commercial',
      status: 'approved',
      trend: 'up',
    },
    {
      id: 2,
      keyword: 'SEO optimization guide',
      volume: 8900,
      kd: 42,
      intent: 'Informational',
      status: 'pending',
      trend: 'stable',
    },
    {
      id: 3,
      keyword: 'keyword research tools',
      volume: 15600,
      kd: 35,
      intent: 'Commercial',
      status: 'approved',
      trend: 'up',
    },
    {
      id: 4,
      keyword: 'content marketing strategy',
      volume: 6200,
      kd: 52,
      intent: 'Informational',
      status: 'rejected',
      trend: 'down',
    },
    {
      id: 5,
      keyword: 'SERP ranking checker',
      volume: 4100,
      kd: 18,
      intent: 'Commercial',
      status: 'approved',
      trend: 'up',
    },
    {
      id: 6,
      keyword: 'backlink analysis software',
      volume: 5800,
      kd: 45,
      intent: 'Commercial',
      status: 'pending',
      trend: 'stable',
    },
  ];

  const itemsPerPage = 6;
  const filteredKeywords = allKeywords.filter(
    (kw) =>
      (selectedStatus === 'all' || kw.status === selectedStatus) &&
      (selectedIntent === 'all' || kw.intent === selectedIntent) &&
      kw.keyword.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredKeywords.length / itemsPerPage);
  const paginatedKeywords = filteredKeywords.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'pending':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'rejected':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  const getIntentColor = (intent: string) => {
    switch (intent) {
      case 'Commercial':
        return 'bg-blue-500/10 text-blue-400';
      case 'Informational':
        return 'bg-purple-500/10 text-purple-400';
      case 'Transactional':
        return 'bg-cyan-500/10 text-cyan-400';
      default:
        return 'bg-slate-500/10 text-slate-400';
    }
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up')
      return <TrendingUp className="w-4 h-4 text-emerald-400" />;
    if (trend === 'down')
      return <TrendingUp className="w-4 h-4 text-rose-400 rotate-180" />;
    return <div className="w-4 h-4 rounded-full bg-slate-600" />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">Keywords</h1>
              <p className="text-slate-400 text-sm">
                Manage and optimize your keyword strategy
              </p>
            </div>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
              <Plus className="w-4 h-4" />
              Add Keywords
            </button>
          </div>

          {/* Search and Quick Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search keywords..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 hover:bg-slate-700 text-sm font-medium transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filters
              {(selectedStatus !== 'all' || selectedIntent !== 'all') && (
                <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold">
                  {(selectedStatus !== 'all' ? 1 : 0) + (selectedIntent !== 'all' ? 1 : 0)}
                </span>
              )}
            </button>
          </div>

          {/* Expandable Filters */}
          {showFilters && (
            <div className="mt-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Status Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase">
                  Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                >
                  <option value="all">All Status</option>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {/* Intent Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase">
                  Search Intent
                </label>
                <select
                  value={selectedIntent}
                  onChange={(e) => {
                    setSelectedIntent(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                >
                  <option value="all">All Intents</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Informational">Informational</option>
                  <option value="Transactional">Transactional</option>
                </select>
              </div>

              {/* Sort */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase">
                  Sort By
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                >
                  <option value="volume">Volume (High to Low)</option>
                  <option value="difficulty">Difficulty</option>
                  <option value="name">Name (A-Z)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {paginatedKeywords.length === 0 ? (
          // Empty State
          <div className="flex flex-col items-center justify-center min-h-[400px] rounded-lg border border-slate-800 bg-slate-800/30">
            <Target className="w-12 h-12 text-slate-600 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">
              {searchQuery || selectedStatus !== 'all' || selectedIntent !== 'all'
                ? 'No keywords found'
                : 'No keywords yet'}
            </h3>
            <p className="text-slate-400 text-sm mb-6">
              {searchQuery || selectedStatus !== 'all' || selectedIntent !== 'all'
                ? 'Try adjusting your filters or search query'
                : 'Add your first keyword to get started'}
            </p>
            {!searchQuery && selectedStatus === 'all' && selectedIntent === 'all' && (
              <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
                <Plus className="w-4 h-4" />
                Add Keyword
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Results Summary */}
            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm text-slate-400">
                Showing <span className="font-semibold text-slate-300">{paginatedKeywords.length}</span> of{' '}
                <span className="font-semibold text-slate-300">{filteredKeywords.length}</span> keywords
              </p>
            </div>

            {/* Keywords Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              {paginatedKeywords.map((kw) => (
                <div
                  key={kw.id}
                  className="group p-5 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600 transition-all duration-200"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-blue-300 transition-colors">
                        {kw.keyword}
                      </h3>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getIntentColor(
                            kw.intent
                          )}`}
                        >
                          <Target className="w-3 h-3" />
                          {kw.intent}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                            kw.status
                          )}`}
                        >
                          {kw.status.charAt(0).toUpperCase() + kw.status.slice(1)}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-2">
                      {getTrendIcon(kw.trend)}
                    </div>
                  </div>

                  {/* Card Metrics */}
                  <div className="grid grid-cols-2 gap-3 mb-4 p-3 rounded-lg bg-slate-900/50">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                        Monthly Volume
                      </p>
                      <p className="text-xl font-bold text-white">
                        {kw.volume.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                        Difficulty
                      </p>
                      <p className="text-xl font-bold">
                        <span className={kw.kd > 40 ? 'text-rose-400' : kw.kd > 25 ? 'text-amber-400' : 'text-emerald-400'}>
                          {kw.kd}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="flex gap-2">
                    <button className="flex-1 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white text-sm font-medium transition-colors">
                      View Details
                    </button>
                    <button className="flex-1 px-3 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors">
                      <Zap className="w-4 h-4 inline mr-1" />
                      Use
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-lg border border-slate-800 bg-slate-800/30">
                <div className="text-sm text-slate-400">
                  Page <span className="font-semibold text-slate-300">{currentPage}</span> of{' '}
                  <span className="font-semibold text-slate-300">{totalPages}</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                  >
                    Previous
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-10 h-10 rounded-lg font-medium transition-colors ${
                        currentPage === page
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-600'
                      }`}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                  >
                    Next
                  </button>
                </div>

                <div className="text-sm text-slate-400">
                  {filteredKeywords.length} total results
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
