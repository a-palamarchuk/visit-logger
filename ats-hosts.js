/* Hosts belonging to applicant tracking systems and job boards.
 *
 * Visit state is keyed by hostname, and these hosts are shared by thousands of
 * unrelated employers. Logging one would cause every future queue to skip every
 * company using that ATS - silently, since a skipped link looks the same as a
 * finished one. Marking is refused for them; the company's own site is what
 * should be logged.
 *
 * The page highlighter also treats a link to one of these hosts as a careers
 * link, whatever the link text says.
 *
 * Loaded as a separate script into both the background page and the content
 * script, so it uses var and function declarations: those are reliably shared
 * with the scripts loaded after it in both contexts.
 */
var ATS_HOSTS = [
  "applicantpool.com", "applicantpro.com", "applicantstack.com", "applytojob.com",
  "appone.com", "appvault.com", "ashbyhq.com", "atsondemand.com", "avahr.com",
  "bamboohr.com", "betterteam.com", "brassring.com", "breezy.hr", "brightmove.com",
  "careerplug.com", "careerspage.io", "comeet.com", "csod.com", "dayforcehcm.com",
  "deel.com", "dover.com", "eightfold.ai", "exacthire.com", "freshteam.com",
  "gem.com", "governmentjobs.com", "gr8people.com", "greenhouse.io", "gusto.com",
  "harri.com", "hibob.com", "hireclick.com", "hireology.com", "hirebridge.com",
  "hiringthing.com", "hrmdirect.com", "hrsmart.com", "icims.com", "interfolio.com",
  "isolvedhire.com", "jobappnetwork.com", "jobscore.com", "jobvite.com",
  "lever.co", "munisselfservice.com", "myworkdayjobs.com", "myworkdaysite.com",
  "njoyn.com", "ns2cloud.com", "oraclecloud.com", "ourcareerpages.com",
  "pageuppeople.com", "paradox.ai", "paycomonline.net", "paylocity.com",
  "peopleadmin.com", "peoplematter.com", "pereless.com", "personio.com",
  "personio.de", "prismhr-hire.com", "recruitee.com", "recruitingbypaycor.com",
  "recruitmentplatform.com", "rippling.com", "saashr.com", "salesforce-sites.com",
  "schoolspring.com", "selectminds.com", "silkroad.com", "smartrecruiters.com",
  "successfactors.com", "taleo.net", "teamworkonline.com", "trakstar.com",
  "ultipro.com", "usajobs.gov", "viglobalcloud.com", "wizehire.com",
  "workable.com", "workforcenow.adp.com", "workstream.us", "zohorecruit.com"
];

/* True if the hostname is an ATS or job board rather than an employer's site.
 *
 * Matches subdomains only. Most of these vendors are themselves employers whose
 * own site should stay loggable: jobs.gusto.com is a board, gusto.com is Gusto.
 */
function isAtsHost(hostname) {
  return ATS_HOSTS.some((d) => hostname.endsWith("." + d));
}
